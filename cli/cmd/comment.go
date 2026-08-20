package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

type comment struct {
	ID         string  `json:"id"`
	CardID     int     `json:"cardId"`
	Body       string  `json:"body"`
	CreatedAt  string  `json:"createdAt"`
	UpdatedAt  string  `json:"updatedAt"`
	AuthorID   *string `json:"authorId"`
	AuthorName *string `json:"authorName"`
}

func (c *comment) author() string {
	if c.AuthorName != nil && *c.AuthorName != "" {
		return *c.AuthorName
	}
	// The schema keeps a comment when its author is deleted (authorId is set null).
	return "(deleted user)"
}

// shortCommentID is how long a comment ID prints. Comment IDs are UUIDs, and a
// full one is longer than the comment it labels; resolveCommentRef accepts any
// unique prefix, so what prints is directly usable as an argument.
const shortCommentID = 8

// resolveCommentRef finds the comment a user named, by full ID or by any
// unambiguous prefix of one. It resolves against the comments of one card so a
// prefix that names someone else's comment on another card can't be reached —
// `/api/comments/:id` takes a bare UUID with no card in the path.
func resolveCommentRef(comments []comment, ref string) (*comment, error) {
	if ref == "" {
		return nil, fmt.Errorf("comment ID required")
	}
	for i := range comments {
		if comments[i].ID == ref {
			return &comments[i], nil
		}
	}
	var matches []*comment
	for i := range comments {
		if strings.HasPrefix(comments[i].ID, ref) {
			matches = append(matches, &comments[i])
		}
	}
	switch len(matches) {
	case 1:
		return matches[0], nil
	case 0:
		return nil, fmt.Errorf("no comment on this card matches %q", ref)
	default:
		ids := make([]string, len(matches))
		for i, m := range matches {
			ids[i] = m.ID
		}
		return nil, fmt.Errorf("%q matches %d comments: %s", ref, len(matches), strings.Join(ids, ", "))
	}
}

// formatComments renders comments as a header line per comment with the body
// indented beneath it. Not a table: a body is markdown and routinely multi-line,
// and a table cell would either truncate it or destroy the alignment.
func formatComments(comments []comment) string {
	if len(comments) == 0 {
		return "No comments.\n"
	}

	authorWidth := 0
	for i := range comments {
		if n := len(comments[i].author()); n > authorWidth {
			authorWidth = n
		}
	}

	var sb strings.Builder
	for i := range comments {
		c := &comments[i]
		id := c.ID
		if len(id) > shortCommentID {
			id = id[:shortCommentID]
		}
		if i > 0 {
			sb.WriteString("\n")
		}
		created := internal.FormatTimestamp(c.CreatedAt)
		fmt.Fprintf(&sb, "%s  %-*s  %s", id, authorWidth, c.author(), created)
		if c.UpdatedAt != "" && c.UpdatedAt != c.CreatedAt {
			// Timestamps render to the minute, so an edit made shortly after the
			// comment would otherwise print the same time twice.
			if edited := internal.FormatTimestamp(c.UpdatedAt); edited == created {
				sb.WriteString("  (edited)")
			} else {
				fmt.Fprintf(&sb, "  (edited %s)", edited)
			}
		}
		sb.WriteString("\n")
		sb.WriteString(indentBody(c.Body))
	}
	return sb.String()
}

// indentBody indents a comment body under its header line. A blank line stays
// blank rather than carrying the indent, so copied output has no trailing
// whitespace.
func indentBody(body string) string {
	var sb strings.Builder
	for _, line := range strings.Split(strings.TrimRight(body, "\n"), "\n") {
		if line == "" {
			sb.WriteString("\n")
			continue
		}
		fmt.Fprintf(&sb, "  %s\n", line)
	}
	return sb.String()
}

var commentFile string

var commentCmd = &cobra.Command{
	Use:   "comment <ticket-id> [add|edit|delete|list] [args...]",
	Short: "Show or manage a card's comments",
	Long: `Show or manage a card's comments.

With no action, the card's comments are listed. edit and delete take a comment ID
as printed by the list — any unambiguous prefix works. Use --file for a
multi-line markdown body instead of passing the text as an argument.

  completo comment TK-42                       # list the card's comments
  completo comment TK-42 add "Ship it"         # add a comment
  completo comment TK-42 add --file notes.md   # add a comment from a file
  completo comment TK-42 edit 3f2a1b9c "Fix"   # edit a comment
  completo comment TK-42 delete 3f2a1b9c       # delete a comment

Editing is author-only; a project owner or instance admin may delete another
member's comment.`,
	Args: cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()

		op := "list"
		rest := []string{}
		if len(args) > 1 {
			op = args[1]
			rest = args[2:]
		}

		// Validate the action before the first request: a typo'd verb should not cost
		// a round trip.
		switch op {
		case "list", "add", "edit", "delete":
		default:
			return fmt.Errorf("unknown action %q: expected add, edit, delete or list", op)
		}

		c, err := fetchCard(client, args[0])
		if err != nil {
			return err
		}

		switch op {
		case "list":
			if len(rest) > 0 {
				return fmt.Errorf("list takes no further arguments")
			}
			comments, err := fetchComments(client, c.ID)
			if err != nil {
				return err
			}
			return printComments(comments)

		case "add":
			body, err := commentBody(cmd, rest, 0)
			if err != nil {
				return err
			}
			if _, err := client.Post(fmt.Sprintf("/api/cards/%d/comments", c.ID), map[string]any{"body": body}); err != nil {
				return fmt.Errorf("failed to add comment: %w", err)
			}
			return reportComments(client, c, "Added comment to %s.")

		case "edit":
			if len(rest) == 0 {
				return fmt.Errorf("comment ID required: completo comment %s edit <comment-id> <text>", args[0])
			}
			body, err := commentBody(cmd, rest, 1)
			if err != nil {
				return err
			}
			comments, err := fetchComments(client, c.ID)
			if err != nil {
				return err
			}
			target, err := resolveCommentRef(comments, rest[0])
			if err != nil {
				return err
			}
			if _, err := client.Put("/api/comments/"+target.ID, map[string]any{"body": body}); err != nil {
				return fmt.Errorf("failed to edit comment: %w", err)
			}
			return reportComments(client, c, "Edited comment on %s.")

		case "delete":
			if len(rest) == 0 {
				return fmt.Errorf("comment ID required: completo comment %s delete <comment-id>", args[0])
			}
			if len(rest) > 1 {
				return fmt.Errorf("delete takes one comment ID")
			}
			comments, err := fetchComments(client, c.ID)
			if err != nil {
				return err
			}
			target, err := resolveCommentRef(comments, rest[0])
			if err != nil {
				return err
			}
			if _, err := client.Delete("/api/comments/" + target.ID); err != nil {
				return fmt.Errorf("failed to delete comment: %w", err)
			}
			if !jsonOutput {
				// Echo the body: a delete is not undoable, and the text is the only
				// part the user can't get back from the API afterwards.
				fmt.Printf("Deleted comment %s by %s on %s:\n", target.ID, target.author(), c.ticket())
				fmt.Print(indentBody(target.Body))
				fmt.Println()
			}
			return reportComments(client, c, "")

		}

		// Unreachable: the action was validated above.
		return fmt.Errorf("unknown action %q", op)
	},
}

// commentBody reads the comment text from --file or from the positional argument
// at index i, insisting on exactly one of the two — a file plus inline text is
// ambiguous about which the user meant, and silently preferring one loses work.
func commentBody(cmd *cobra.Command, rest []string, i int) (string, error) {
	hasArg := len(rest) > i
	if len(rest) > i+1 {
		return "", fmt.Errorf("comment text must be a single argument — quote it")
	}
	if cmd.Flags().Changed("file") {
		if hasArg {
			return "", fmt.Errorf("pass comment text or --file, not both")
		}
		b, err := os.ReadFile(commentFile)
		if err != nil {
			return "", fmt.Errorf("failed to read comment file: %w", err)
		}
		body := strings.TrimSpace(string(b))
		if body == "" {
			return "", fmt.Errorf("comment file %s is empty", commentFile)
		}
		return body, nil
	}
	if !hasArg {
		return "", fmt.Errorf("comment text required: pass it as an argument or use --file")
	}
	body := strings.TrimSpace(rest[i])
	if body == "" {
		return "", fmt.Errorf("comment text is empty")
	}
	return body, nil
}

func fetchComments(client *internal.Client, cardID int) ([]comment, error) {
	data, err := client.Get(fmt.Sprintf("/api/cards/%d/comments", cardID))
	if err != nil {
		return nil, err
	}
	var comments []comment
	if err := json.Unmarshal(data, &comments); err != nil {
		return nil, fmt.Errorf("failed to parse comments: %w", err)
	}
	return comments, nil
}

// reportComments prints the card's comment list after a mutation, re-fetched so
// the output is the server's state rather than the CLI's guess at it.
func reportComments(client *internal.Client, c *cardResponse, headline string) error {
	comments, err := fetchComments(client, c.ID)
	if err != nil {
		return err
	}
	if headline != "" && !jsonOutput {
		fmt.Printf(headline+"\n", c.ticket())
	}
	return printComments(comments)
}

func printComments(comments []comment) error {
	if jsonOutput {
		if comments == nil {
			comments = []comment{}
		}
		b, err := json.MarshalIndent(map[string]any{"comments": comments}, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(b))
		return nil
	}
	fmt.Print(formatComments(comments))
	return nil
}

func init() {
	commentCmd.Flags().StringVar(&commentFile, "file", "", "Read the comment body from a file (markdown)")
	rootCmd.AddCommand(commentCmd)
}

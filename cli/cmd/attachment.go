package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strings"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

type attachment struct {
	ID           string `json:"id"`
	CardID       int    `json:"cardId"`
	OriginalName string `json:"originalName"`
	MimeType     string `json:"mimeType"`
	Size         int64  `json:"size"`
	CreatedAt    string `json:"createdAt"`
	Uploader     *struct {
		Name string `json:"name"`
	} `json:"uploader"`
}

func (a *attachment) uploader() string {
	if a.Uploader != nil && a.Uploader.Name != "" {
		return a.Uploader.Name
	}
	// The schema keeps an attachment when its uploader is deleted (set null).
	return "(deleted user)"
}

// shortAttachmentID is how long an attachment ID prints, as for comments: a full
// UUID is longer than most file names, and resolveAttachmentRef takes any unique
// prefix, so what prints is directly usable as an argument.
const shortAttachmentID = 8

// resolveAttachmentRef finds the attachment a user named among one card's
// attachments: the full ID, an unambiguous ID prefix, or the exact file name when
// only one attachment has it. Resolving inside the card keeps a prefix from
// reaching a file on another card; `/api/attachments/:id` takes a bare UUID.
func resolveAttachmentRef(list []attachment, ref string) (*attachment, error) {
	if ref == "" {
		return nil, fmt.Errorf("attachment ID or file name required")
	}
	for i := range list {
		if list[i].ID == ref {
			return &list[i], nil
		}
	}
	var byPrefix, byName []*attachment
	for i := range list {
		if strings.HasPrefix(list[i].ID, ref) {
			byPrefix = append(byPrefix, &list[i])
		}
		if list[i].OriginalName == ref {
			byName = append(byName, &list[i])
		}
	}
	if len(byPrefix) == 1 {
		return byPrefix[0], nil
	}
	if len(byName) == 1 {
		return byName[0], nil
	}
	if len(byPrefix) > 1 || len(byName) > 1 {
		matches := append(byPrefix, byName...)
		ids := make([]string, 0, len(matches))
		for _, m := range matches {
			ids = append(ids, m.ID+" "+m.OriginalName)
		}
		return nil, fmt.Errorf("%q matches more than one attachment: %s", ref, strings.Join(ids, ", "))
	}
	return nil, fmt.Errorf("no attachment on this card matches %q", ref)
}

// humanSize renders a byte count the way a file manager does.
func humanSize(n int64) string {
	switch {
	case n < 1024:
		return fmt.Sprintf("%d B", n)
	case n < 1024*1024:
		return fmt.Sprintf("%.1f KB", float64(n)/1024)
	default:
		return fmt.Sprintf("%.1f MB", float64(n)/1024/1024)
	}
}

func formatAttachments(list []attachment) string {
	if len(list) == 0 {
		return "No attachments.\n"
	}
	rows := make([][]string, len(list))
	for i := range list {
		a := &list[i]
		id := a.ID
		if len(id) > shortAttachmentID {
			id = id[:shortAttachmentID]
		}
		rows[i] = []string{id, a.OriginalName, humanSize(a.Size), a.uploader(), internal.FormatTimestamp(a.CreatedAt)}
	}
	return internal.FormatTable([]string{"ID", "NAME", "SIZE", "UPLOADED BY", "CREATED"}, rows)
}

func fetchAttachments(client *internal.Client, cardID int) ([]attachment, error) {
	data, err := client.Get(fmt.Sprintf("/api/cards/%d/attachments", cardID))
	if err != nil {
		return nil, fmt.Errorf("failed to fetch attachments: %w", err)
	}
	var list []attachment
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, fmt.Errorf("failed to parse attachments: %w", err)
	}
	if list == nil {
		list = []attachment{}
	}
	return list, nil
}

// uploadContentType is the type the upload declares. The server's allowlist
// matches `image/*`, `text/*` and `application/pdf` on the declared type and
// everything else on the extension, so an image sent as octet-stream would be
// refused although its extension is fine.
func uploadContentType(name string) string {
	if t := mime.TypeByExtension(strings.ToLower(filepath.Ext(name))); t != "" {
		return t
	}
	return "application/octet-stream"
}

// downloadTarget is where a download goes: the --output path, a file of the
// attachment's name inside --output when that is a directory, or the
// attachment's name in the current directory. The name is reduced to its base,
// so a stored name can never write outside the chosen directory.
func downloadTarget(output, originalName string) string {
	name := filepath.Base(filepath.Clean("/" + strings.ReplaceAll(originalName, "\\", "/")))
	if name == "/" || name == "." || name == "" {
		name = "attachment"
	}
	if output == "" {
		return name
	}
	if info, err := os.Stat(output); err == nil && info.IsDir() {
		return filepath.Join(output, name)
	}
	return output
}

var (
	attachmentOutput string
	attachmentForce  bool
)

var attachmentCmd = &cobra.Command{
	Use:     "attachment <ticket-id> [list|add|download|delete] [args...]",
	Aliases: []string{"attachments"},
	Short:   "Show or manage a card's attachments",
	Long: `Show or manage a card's attachments.

With no action, the card's attachments are listed. download and delete take an
attachment ID as printed by the list (any unambiguous prefix works) or the exact
file name.

  completo attachment TK-42                          # list the card's files
  completo attachment TK-42 add report.csv shot.png  # attach one or more files
  completo attachment TK-42 download 3f2a1b9c        # save to ./<file name>
  completo attachment TK-42 download report.csv -o /tmp/
  completo attachment TK-42 download report.csv -o - # write to stdout
  completo attachment TK-42 delete 3f2a1b9c

The server decides which types and sizes it accepts (by default images, PDF,
text, Markdown, CSV, JSON, XML, zip and Office documents, up to 10 MB).`,
	Args: cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()

		op := "list"
		rest := []string{}
		if len(args) > 1 {
			op = args[1]
			rest = args[2:]
		}
		switch op {
		case "list", "add", "download", "delete":
		default:
			return fmt.Errorf("unknown action %q: expected add, download, delete or list", op)
		}

		// Read every file before the first request: a typo in the third name should
		// not leave the first two attached.
		type upload struct {
			name string
			data []byte
		}
		var uploads []upload
		if op == "add" {
			if len(rest) == 0 {
				return fmt.Errorf("file required: completo attachment %s add <file> [file...]", args[0])
			}
			for _, path := range rest {
				data, err := os.ReadFile(path)
				if err != nil {
					return fmt.Errorf("failed to read %s: %w", path, err)
				}
				uploads = append(uploads, upload{name: filepath.Base(path), data: data})
			}
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
			list, err := fetchAttachments(client, c.ID)
			if err != nil {
				return err
			}
			return printAttachments(list)

		case "add":
			var added []attachment
			for _, u := range uploads {
				data, err := client.PostFile(fmt.Sprintf("/api/cards/%d/attachments", c.ID), "file", u.name, uploadContentType(u.name), u.data)
				if err != nil {
					// Report what already went up, so a retry does not attach it twice.
					for _, a := range added {
						fmt.Fprintf(os.Stderr, "Attached %s to %s.\n", a.OriginalName, c.ticket())
					}
					return fmt.Errorf("failed to attach %s: %w", u.name, err)
				}
				var a attachment
				if err := json.Unmarshal(data, &a); err != nil {
					return fmt.Errorf("failed to parse upload response: %w", err)
				}
				added = append(added, a)
			}
			if jsonOutput {
				return printJSON(added)
			}
			for _, a := range added {
				fmt.Printf("Attached %s (%s) to %s.\n", a.OriginalName, humanSize(a.Size), c.ticket())
			}
			list, err := fetchAttachments(client, c.ID)
			if err != nil {
				return err
			}
			fmt.Println()
			fmt.Print(formatAttachments(list))
			return nil

		case "download":
			if len(rest) != 1 {
				return fmt.Errorf("download takes one attachment ID or file name")
			}
			list, err := fetchAttachments(client, c.ID)
			if err != nil {
				return err
			}
			target, err := resolveAttachmentRef(list, rest[0])
			if err != nil {
				return err
			}
			path := fmt.Sprintf("/api/attachments/%s/download", target.ID)
			if attachmentOutput == "-" {
				_, err := client.Download(path, os.Stdout)
				return err
			}
			dest := downloadTarget(attachmentOutput, target.OriginalName)
			flags := os.O_WRONLY | os.O_CREATE | os.O_EXCL
			if attachmentForce {
				flags = os.O_WRONLY | os.O_CREATE | os.O_TRUNC
			}
			f, err := os.OpenFile(dest, flags, 0o644)
			if errors.Is(err, os.ErrExist) {
				return fmt.Errorf("%s already exists: pass --force to overwrite, or -o to choose another path", dest)
			}
			if err != nil {
				return err
			}
			n, err := client.Download(path, f)
			if cerr := f.Close(); err == nil {
				err = cerr
			}
			if err != nil {
				// A partial file looks like the real one; don't leave it behind.
				os.Remove(dest)
				return fmt.Errorf("failed to download %s: %w", target.OriginalName, err)
			}
			if jsonOutput {
				return printJSON(map[string]any{"id": target.ID, "name": target.OriginalName, "path": dest, "size": n})
			}
			fmt.Printf("Saved %s (%s) to %s.\n", target.OriginalName, humanSize(n), dest)
			return nil

		case "delete":
			if len(rest) != 1 {
				return fmt.Errorf("delete takes one attachment ID or file name")
			}
			list, err := fetchAttachments(client, c.ID)
			if err != nil {
				return err
			}
			target, err := resolveAttachmentRef(list, rest[0])
			if err != nil {
				return err
			}
			if _, err := client.Delete("/api/attachments/" + target.ID); err != nil {
				return fmt.Errorf("failed to delete attachment: %w", err)
			}
			if jsonOutput {
				return printJSON(map[string]any{"deleted": map[string]any{"id": target.ID, "name": target.OriginalName}})
			}
			fmt.Printf("Deleted %s (%s) from %s.\n", target.OriginalName, target.ID, c.ticket())
			return nil
		}
		return fmt.Errorf("unknown action %q", op)
	},
}

func printAttachments(list []attachment) error {
	if jsonOutput {
		return printJSON(list)
	}
	fmt.Print(formatAttachments(list))
	return nil
}

func printJSON(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func init() {
	attachmentCmd.Flags().StringVarP(&attachmentOutput, "output", "o", "", "download: file or directory to save to, or - for stdout")
	attachmentCmd.Flags().BoolVar(&attachmentForce, "force", false, "download: overwrite an existing file")
	rootCmd.AddCommand(attachmentCmd)
}

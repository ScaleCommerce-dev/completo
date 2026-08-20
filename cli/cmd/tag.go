package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

type tag struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Color *string `json:"color"`
}

// tagPlan is the outcome of an add/remove/set against the card's current tags.
// The API offers no incremental endpoint — `PUT /api/cards/:id/tags` replaces the
// whole list — so every operation is computed client-side down to one final set
// of tag IDs.
type tagPlan struct {
	// KeepIDs are the project tags the card should end up carrying.
	KeepIDs []string
	// Create names tags the project doesn't have yet. The caller creates each and
	// appends its ID to KeepIDs before the PUT.
	Create []string
	// Unchanged reports that the card already carries exactly this list, so the
	// PUT can be skipped. Not just an optimisation: a needless replace would
	// churn every card_tags row.
	Unchanged bool
}

// planTagChange computes the card's resulting tag list.
//
// Names match case-sensitively: a project may legitimately hold both "API" and
// "api", and guessing which one the user meant is worse than asking. `add` and
// `set` auto-create unknown names; `remove` insists every name is currently on
// the card, because a typo that silently no-ops looks exactly like success.
func planTagChange(op string, current, projectTags []tag, names []string) (*tagPlan, error) {
	names = dedupe(names)
	if len(names) == 0 && op != "set" {
		return nil, fmt.Errorf("at least one tag name required")
	}

	currentByName := map[string]tag{}
	for _, t := range current {
		currentByName[t.Name] = t
	}
	projectByName := map[string]tag{}
	for _, t := range projectTags {
		projectByName[t.Name] = t
	}

	// Non-nil: `set` with no names and `remove` of every tag both end with an empty
	// list, and a nil slice marshals to `null`, which the API rejects outright.
	plan := &tagPlan{KeepIDs: []string{}}

	switch op {
	case "add":
		for _, t := range current {
			plan.KeepIDs = append(plan.KeepIDs, t.ID)
		}
		for _, name := range names {
			if _, on := currentByName[name]; on {
				continue
			}
			if t, known := projectByName[name]; known {
				plan.KeepIDs = append(plan.KeepIDs, t.ID)
			} else {
				plan.Create = append(plan.Create, name)
			}
		}

	case "remove":
		var unknown []string
		for _, name := range names {
			if _, on := currentByName[name]; !on {
				unknown = append(unknown, name)
			}
		}
		if len(unknown) > 0 {
			return nil, fmt.Errorf("not on this card: %s", strings.Join(unknown, ", "))
		}
		drop := map[string]bool{}
		for _, name := range names {
			drop[name] = true
		}
		for _, t := range current {
			if !drop[t.Name] {
				plan.KeepIDs = append(plan.KeepIDs, t.ID)
			}
		}

	case "set":
		for _, name := range names {
			if t, known := projectByName[name]; known {
				plan.KeepIDs = append(plan.KeepIDs, t.ID)
			} else {
				plan.Create = append(plan.Create, name)
			}
		}

	default:
		return nil, fmt.Errorf("unknown action %q: expected add, remove, set or list", op)
	}

	plan.Unchanged = len(plan.Create) == 0 && sameIDs(plan.KeepIDs, currentIDs(current))
	return plan, nil
}

func currentIDs(tags []tag) []string {
	ids := make([]string, 0, len(tags))
	for _, t := range tags {
		ids = append(ids, t.ID)
	}
	return ids
}

// sameIDs compares two tag ID lists as sets — the card's tag list has no
// meaningful order (the API reads it back with an `inArray`), so a reordering is
// not a change.
func sameIDs(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	seen := map[string]int{}
	for _, id := range a {
		seen[id]++
	}
	for _, id := range b {
		seen[id]--
		if seen[id] < 0 {
			return false
		}
	}
	return true
}

func dedupe(names []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(names))
	for _, n := range names {
		if n == "" || seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	return out
}

var tagCmd = &cobra.Command{
	Use:   "tag <ticket-id> [add|remove|set|list] [tags...]",
	Short: "Show or change a card's tags",
	Long: `Show or change a card's tags.

Tags are matched by name, case-sensitively. add and set create a tag that the
project doesn't have yet, which requires the project owner role; remove fails if
a named tag isn't on the card. With no action, the card's tags are listed.

  completo tag TK-42                        # list the card's tags
  completo tag TK-42 add frontend backend   # add, creating them if needed
  completo tag TK-42 remove backend         # remove
  completo tag TK-42 set bug                # replace the whole list
  completo tag TK-42 set                    # clear every tag

Run "completo tags" for the project's existing names before creating one.`,
	Args: cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()

		op := "list"
		var names []string
		if len(args) > 1 {
			op = args[1]
			names = args[2:]
		}

		// Validate the action before the first request: a typo'd verb should not
		// cost a round trip, nor dump a card's tags as if it were a real failure.
		switch op {
		case "list", "add", "remove", "set":
		default:
			return fmt.Errorf("unknown action %q: expected add, remove, set or list", op)
		}

		c, err := fetchCard(client, args[0])
		if err != nil {
			return err
		}

		if op == "list" {
			if len(names) > 0 {
				return fmt.Errorf("list takes no tag names")
			}
			return printTags(c.Tags)
		}

		projectTags, err := fetchProjectTags(client, c.ProjectID)
		if err != nil {
			return err
		}

		plan, err := planTagChange(op, c.Tags, projectTags, names)
		if err != nil {
			if len(c.Tags) > 0 && !jsonOutput {
				fmt.Fprintf(cmd.ErrOrStderr(), "%s carries: %s\n", c.ticket(), strings.Join(tagNames(c.Tags), ", "))
			}
			return err
		}

		if plan.Unchanged {
			if !jsonOutput {
				fmt.Printf("%s tags unchanged.\n", c.ticket())
			}
			return printTags(c.Tags)
		}

		for _, name := range plan.Create {
			if shadow := caseShadow(projectTags, name); shadow != "" && !jsonOutput {
				// Matching is case-sensitive by design, so this is a new tag, not a
				// typo the CLI may correct. Say so, or a near-duplicate lands silently.
				fmt.Fprintf(cmd.ErrOrStderr(), "Note: the project already has %q — tag names are case-sensitive, so %q is a new tag.\n", shadow, name)
			}
			created, err := createProjectTag(client, c.ProjectID, name)
			if err != nil {
				return err
			}
			if !jsonOutput {
				fmt.Printf("Created tag %q.\n", name)
			}
			plan.KeepIDs = append(plan.KeepIDs, created.ID)
		}

		data, err := client.Put(fmt.Sprintf("/api/cards/%d/tags", c.ID), map[string]any{"tagIds": plan.KeepIDs})
		if err != nil {
			return fmt.Errorf("failed to update tags: %w", err)
		}
		var result struct {
			Tags []tag `json:"tags"`
		}
		if err := json.Unmarshal(data, &result); err != nil {
			return fmt.Errorf("failed to parse response: %w", err)
		}

		if !jsonOutput {
			fmt.Printf("Updated tags on %s.\n", c.ticket())
		}
		return printTags(result.Tags)
	},
}

// tagsCmd is the counterpart to `statuses`: tag names are matched
// case-sensitively and `add` creates an unknown one, so picking the right
// spelling needs the project's list in front of you.
var tagsCmd = &cobra.Command{
	Use:   "tags [project-slug]",
	Short: "List a project's tags",
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		slug := cfg.Project
		if len(args) > 0 {
			slug = args[0]
		}
		if slug == "" {
			return fmt.Errorf("project required: pass as argument or set PROJECT in .completo")
		}

		projectID, err := resolveProjectID(client, slug)
		if err != nil {
			return err
		}
		tags, err := fetchProjectTags(client, projectID)
		if err != nil {
			return err
		}
		return printTags(tags)
	},
}

func fetchProjectTags(client *internal.Client, projectID string) ([]tag, error) {
	data, err := client.Get("/api/projects/" + projectID + "/tags")
	if err != nil {
		return nil, err
	}
	var tags []tag
	if err := json.Unmarshal(data, &tags); err != nil {
		return nil, fmt.Errorf("failed to parse project tags: %w", err)
	}
	return tags, nil
}

func createProjectTag(client *internal.Client, projectID, name string) (*tag, error) {
	data, err := client.Post("/api/projects/"+projectID+"/tags", map[string]any{"name": name})
	if err != nil {
		var apiErr *internal.APIError
		if errors.As(err, &apiErr) && apiErr.StatusCode == 403 {
			return nil, fmt.Errorf("cannot create tag %q: creating a tag requires the project owner role", name)
		}
		return nil, fmt.Errorf("failed to create tag %q: %w", name, err)
	}
	var t tag
	if err := json.Unmarshal(data, &t); err != nil {
		return nil, fmt.Errorf("failed to parse created tag: %w", err)
	}
	return &t, nil
}

// caseShadow returns an existing project tag whose name differs from the given
// one only in case, or "" when there is none.
func caseShadow(projectTags []tag, name string) string {
	for _, t := range projectTags {
		if t.Name != name && strings.EqualFold(t.Name, name) {
			return t.Name
		}
	}
	return ""
}

func tagNames(tags []tag) []string {
	names := make([]string, 0, len(tags))
	for _, t := range tags {
		names = append(names, t.Name)
	}
	return names
}

// printTags renders a tag list, sorted by name so the same set always prints the
// same way — the API reads tags back with an `inArray`, which has no order.
func printTags(tags []tag) error {
	sorted := make([]tag, len(tags))
	copy(sorted, tags)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Name < sorted[j].Name })

	if jsonOutput {
		b, err := json.MarshalIndent(map[string]any{"tags": sorted}, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(b))
		return nil
	}

	if len(sorted) == 0 {
		fmt.Println("No tags.")
		return nil
	}

	rows := make([][]string, len(sorted))
	for i, t := range sorted {
		color := ""
		if t.Color != nil {
			color = *t.Color
		}
		rows[i] = []string{t.Name, color}
	}
	fmt.Print(internal.FormatTable([]string{"NAME", "COLOR"}, rows))
	return nil
}

func init() {
	rootCmd.AddCommand(tagCmd)
	rootCmd.AddCommand(tagsCmd)
}

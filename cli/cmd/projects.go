package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

type project struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Slug       string  `json:"slug"`
	Key        string  `json:"key"`
	Icon       string  `json:"icon"`
	ArchivedAt *string `json:"archivedAt"`
}

var projectsArchived bool

// listedProjects drops archived projects unless they were asked for. The API
// returns them all, so that a slug of an archived project still resolves
// (`resolveProjectID`), and leaving them out is the listing's choice.
func listedProjects(all []project, includeArchived bool) []project {
	if includeArchived {
		return all
	}
	out := make([]project, 0, len(all))
	for _, p := range all {
		if p.ArchivedAt == nil {
			out = append(out, p)
		}
	}
	return out
}

var projectsCmd = &cobra.Command{
	Use:   "projects",
	Short: "List accessible projects (archived ones with --archived)",
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		data, err := client.Get("/api/projects")
		if err != nil {
			return err
		}

		// Raw entries alongside the parsed ones, so --json passes on every field
		// the API sends rather than the few this command reads.
		var raw []json.RawMessage
		if err := json.Unmarshal(data, &raw); err != nil {
			return fmt.Errorf("failed to parse response: %w", err)
		}
		var all []project
		if err := json.Unmarshal(data, &all); err != nil {
			return fmt.Errorf("failed to parse response: %w", err)
		}
		projects := listedProjects(all, projectsArchived)

		if jsonOutput {
			kept := make([]json.RawMessage, 0, len(projects))
			for i, p := range all {
				if projectsArchived || p.ArchivedAt == nil {
					kept = append(kept, raw[i])
				}
			}
			out, err := json.Marshal(kept)
			if err != nil {
				return err
			}
			fmt.Println(string(out))
			return nil
		}

		if len(projects) == 0 {
			fmt.Println("No projects found.")
			return nil
		}

		headers := []string{"SLUG", "KEY", "NAME"}
		if projectsArchived {
			headers = append(headers, "ARCHIVED")
		}
		rows := make([][]string, len(projects))
		for i, p := range projects {
			rows[i] = []string{p.Slug, p.Key, p.Name}
			if projectsArchived {
				archived := ""
				if p.ArchivedAt != nil {
					archived = "yes"
				}
				rows[i] = append(rows[i], archived)
			}
		}
		fmt.Print(internal.FormatTable(headers, rows))
		return nil
	},
}

func init() {
	projectsCmd.Flags().BoolVar(&projectsArchived, "archived", false, "Include archived projects")
	rootCmd.AddCommand(projectsCmd)
}

// resolveProjectID looks up the project ID by slug.
func resolveProjectID(client *internal.Client, slugOrID string) (string, error) {
	data, err := client.Get("/api/projects")
	if err != nil {
		return "", err
	}
	var projects []project
	if err := json.Unmarshal(data, &projects); err != nil {
		return "", err
	}
	for _, p := range projects {
		if p.Slug == slugOrID || p.ID == slugOrID || p.Name == slugOrID {
			return p.ID, nil
		}
	}
	fmt.Fprintln(os.Stderr, "Available projects:")
	for _, p := range projects {
		fmt.Fprintf(os.Stderr, "  %s (%s)\n", p.Slug, p.Name)
	}
	return "", fmt.Errorf("project %q not found", slugOrID)
}

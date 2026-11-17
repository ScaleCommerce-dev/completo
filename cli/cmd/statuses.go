package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

type projectDetail struct {
	ID                string   `json:"id"`
	Name              string   `json:"name"`
	Slug              string   `json:"slug"`
	Key               string   `json:"key"`
	DoneStatusID      *string  `json:"doneStatusId"`
	DoneRetentionDays *int     `json:"doneRetentionDays"`
	Statuses          []status `json:"statuses"`
	Boards            []struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
	} `json:"boards"`
}

type status struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Color *string `json:"color"`
}

var statusesCmd = &cobra.Command{
	Use:   "statuses [project-slug]",
	Short: "List statuses for a project",
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		slug, err := projectSlug(cfg, args)
		if err != nil {
			return err
		}

		proj, err := fetchProject(client, slug)
		if err != nil {
			return err
		}

		if jsonOutput {
			b, _ := json.MarshalIndent(proj.Statuses, "", "  ")
			fmt.Println(string(b))
			return nil
		}

		headers := []string{"NAME", "COLOR", "DONE"}
		rows := make([][]string, len(proj.Statuses))
		for i, s := range proj.Statuses {
			done := ""
			if proj.DoneStatusID != nil && s.ID == *proj.DoneStatusID {
				done = "yes"
			}
			color := ""
			if s.Color != nil {
				color = *s.Color
			}
			rows[i] = []string{s.Name, color, done}
		}
		fmt.Print(internal.FormatTable(headers, rows))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(statusesCmd)
}

func fetchProject(client *internal.Client, slugOrID string) (*projectDetail, error) {
	projectID, err := resolveProjectID(client, slugOrID)
	if err != nil {
		return nil, err
	}
	data, err := client.Get("/api/projects/" + projectID)
	if err != nil {
		return nil, err
	}
	var proj projectDetail
	if err := json.Unmarshal(data, &proj); err != nil {
		return nil, fmt.Errorf("failed to parse project: %w", err)
	}
	return &proj, nil
}

// projectSlug is the positional project argument, or PROJECT from .completo.
func projectSlug(cfg *internal.Config, args []string) (string, error) {
	if len(args) > 0 {
		return args[0], nil
	}
	if cfg.Project == "" {
		return "", fmt.Errorf("project required: name it, or set PROJECT in .completo")
	}
	return cfg.Project, nil
}

// requireStatus finds a status by its exact name, or lists the project's statuses
// on stderr and fails. Stderr, so a failed lookup never lands in --json output.
func requireStatus(statuses []status, name string) (*status, error) {
	if s := findStatusByName(statuses, name); s != nil {
		return s, nil
	}
	fmt.Fprintf(os.Stderr, "Status %q not found. Available statuses:\n", name)
	printStatusNames(statuses)
	return nil, fmt.Errorf("status %q not found", name)
}

func printStatusNames(statuses []status) {
	for _, st := range statuses {
		fmt.Fprintf(os.Stderr, "  %s\n", st.Name)
	}
}

func findStatusByName(statuses []status, name string) *status {
	for _, s := range statuses {
		if s.Name == name {
			return &s
		}
	}
	return nil
}

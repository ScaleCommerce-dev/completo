package cmd

import (
	"encoding/json"
	"fmt"

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
	Boards []struct {
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
		slug := cfg.Project
		if len(args) > 0 {
			slug = args[0]
		}
		if slug == "" {
			return fmt.Errorf("project required: pass as argument or set PROJECT in .completo")
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

func findStatusByName(statuses []status, name string) *status {
	for _, s := range statuses {
		if s.Name == name {
			return &s
		}
	}
	return nil
}

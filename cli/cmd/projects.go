package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

type project struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
	Key  string `json:"key"`
	Icon string `json:"icon"`
}

var projectsCmd = &cobra.Command{
	Use:   "projects",
	Short: "List accessible projects",
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		data, err := client.Get("/api/projects")
		if err != nil {
			return err
		}

		var projects []project
		if err := json.Unmarshal(data, &projects); err != nil {
			return fmt.Errorf("failed to parse response: %w", err)
		}

		if jsonOutput {
			fmt.Println(string(data))
			return nil
		}

		if len(projects) == 0 {
			fmt.Println("No projects found.")
			return nil
		}

		headers := []string{"SLUG", "KEY", "NAME"}
		rows := make([][]string, len(projects))
		for i, p := range projects {
			rows[i] = []string{p.Slug, p.Key, p.Name}
		}
		fmt.Print(internal.FormatTable(headers, rows))
		return nil
	},
}

func init() {
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
		if p.Slug == slugOrID || p.ID == slugOrID {
			return p.ID, nil
		}
	}
	fmt.Fprintln(os.Stderr, "Available projects:")
	for _, p := range projects {
		fmt.Fprintf(os.Stderr, "  %s (%s)\n", p.Slug, p.Name)
	}
	return "", fmt.Errorf("project %q not found", slugOrID)
}

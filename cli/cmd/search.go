package cmd

import (
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

var searchProject string

var searchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search cards in a project (--project, or PROJECT from .completo)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		// The query is the positional argument here, so the project comes by flag;
		// the lookup and its message are the other commands' (`projectSlug`).
		var named []string
		if searchProject != "" {
			named = []string{searchProject}
		}
		slug, err := projectSlug(cfg, named)
		if err != nil {
			return err
		}

		proj, err := fetchProject(client, slug)
		if err != nil {
			return err
		}

		query := url.QueryEscape(args[0])
		data, err := client.Get(fmt.Sprintf("/api/projects/%s/cards/search?q=%s", proj.ID, query))
		if err != nil {
			return err
		}

		if jsonOutput {
			fmt.Println(string(data))
			return nil
		}

		var results []struct {
			ID       int     `json:"id"`
			Title    string  `json:"title"`
			Priority *string `json:"priority"`
		}
		if err := json.Unmarshal(data, &results); err != nil {
			return err
		}

		if len(results) == 0 {
			fmt.Println("No cards found.")
			return nil
		}

		headers := []string{"TICKET", "TITLE", "PRIORITY"}
		rows := make([][]string, len(results))
		for i, r := range results {
			priority := ""
			if r.Priority != nil {
				priority = *r.Priority
			}
			rows[i] = []string{fmt.Sprintf("%s-%d", proj.Key, r.ID), r.Title, priority}
		}
		fmt.Print(internal.FormatTable(headers, rows))
		return nil
	},
}

func init() {
	searchCmd.Flags().StringVarP(&searchProject, "project", "p", "", "Project slug (default: PROJECT from .completo)")
	rootCmd.AddCommand(searchCmd)
}

package cmd

import (
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

var searchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search cards in a project",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		slug := cfg.Project
		if slug == "" {
			return fmt.Errorf("project required: set PROJECT in .completo")
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
	rootCmd.AddCommand(searchCmd)
}

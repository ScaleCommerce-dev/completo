package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

var nextStatus string
var nextAll bool

var nextCmd = &cobra.Command{
	Use:   "next [project-slug]",
	Short: "Fetch next card from a status (default: To Do)",
	Long:  "Returns the first card (by position) in the given status. Use --all to list every card in the status. Uses the project from .completo if not specified.",
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		slug := cfg.Project
		if len(args) > 0 {
			slug = args[0]
		}
		if slug == "" {
			return fmt.Errorf("project required: pass as argument or set PROJECT in .completo")
		}

		statusName := nextStatus
		if statusName == "" {
			statusName = cfg.TodoStatus
		}

		proj, err := fetchProject(client, slug)
		if err != nil {
			return err
		}

		s := findStatusByName(proj.Statuses, statusName)
		if s == nil {
			fmt.Printf("Status %q not found. Available statuses:\n", statusName)
			for _, st := range proj.Statuses {
				fmt.Printf("  %s\n", st.Name)
			}
			return fmt.Errorf("status %q not found", statusName)
		}

		// Fetch cards in status, sorted by position
		path := fmt.Sprintf("/api/projects/%s/cards?statusId=%s&sort=position&order=asc", proj.ID, s.ID)
		if !nextAll {
			path += "&limit=1"
		}
		data, err := client.Get(path)
		if err != nil {
			return err
		}

		var cards []card
		if err := json.Unmarshal(data, &cards); err != nil {
			return fmt.Errorf("failed to parse cards: %w", err)
		}

		if len(cards) == 0 {
			fmt.Printf("No cards in status %q.\n", statusName)
			return nil
		}

		if nextAll {
			if jsonOutput {
				b, _ := json.MarshalIndent(cards, "", "  ")
				fmt.Println(string(b))
				return nil
			}

			headers := []string{"TICKET", "TITLE", "PRIORITY"}
			rows := make([][]string, len(cards))
			for i, c := range cards {
				priority := ""
				if c.Priority != nil {
					priority = *c.Priority
				}
				rows[i] = []string{fmt.Sprintf("%s-%d", proj.Key, c.ID), c.Title, priority}
			}
			fmt.Print(internal.FormatTable(headers, rows))
			return nil
		}

		best := &cards[0]

		if jsonOutput {
			b, _ := json.MarshalIndent(best, "", "  ")
			fmt.Println(string(b))
			return nil
		}

		resp := &cardResponse{card: *best, Project: &projectInfo{Key: proj.Key}}
		fmt.Print(formatCard(resp))
		return nil
	},
}

func init() {
	nextCmd.Flags().StringVar(&nextStatus, "status", "", "Status to fetch from (default: TODO_STATUS from .completo or 'To Do')")
	nextCmd.Flags().BoolVar(&nextAll, "all", false, "List all cards in the status instead of just the top one")
	rootCmd.AddCommand(nextCmd)
}

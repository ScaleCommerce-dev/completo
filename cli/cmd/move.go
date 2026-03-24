package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
)

var moveCmd = &cobra.Command{
	Use:   "move <ticket-id> <status-name>",
	Short: "Move a card to a named status",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		ticketID := args[0]
		targetStatus := args[1]

		// Fetch the card to get its project
		data, err := client.Get("/api/cards/" + ticketID)
		if err != nil {
			return fmt.Errorf("card not found: %w", err)
		}
		var c cardResponse
		if err := json.Unmarshal(data, &c); err != nil {
			return err
		}

		// Fetch project to resolve status name to ID
		proj, err := fetchProject(client, c.ProjectID)
		if err != nil {
			return err
		}

		s := findStatusByName(proj.Statuses, targetStatus)
		if s == nil {
			fmt.Printf("Status %q not found. Available statuses:\n", targetStatus)
			for _, st := range proj.Statuses {
				fmt.Printf("  %s\n", st.Name)
			}
			return fmt.Errorf("status %q not found", targetStatus)
		}

		// Move to position 0 (top of the column)
		payload := map[string]any{
			"statusId": s.ID,
			"position": 0,
		}
		_, err = client.Put(fmt.Sprintf("/api/cards/%d/move", c.ID), payload)
		if err != nil {
			return fmt.Errorf("failed to move card: %w", err)
		}

		fmt.Printf("Moved %s-%d to %q\n", proj.Key, c.ID, targetStatus)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(moveCmd)
}

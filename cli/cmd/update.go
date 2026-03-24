package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	updateTitle       string
	updateDescription string
	updateDescFile    string
	updatePriority    string
	updateDueDate     string
)

var updateCmd = &cobra.Command{
	Use:   "update <ticket-id>",
	Short: "Update card fields",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		ticketID := args[0]

		payload := map[string]any{}

		if cmd.Flags().Changed("title") {
			payload["title"] = updateTitle
		}
		if cmd.Flags().Changed("description-file") {
			b, err := os.ReadFile(updateDescFile)
			if err != nil {
				return fmt.Errorf("failed to read description file: %w", err)
			}
			payload["description"] = string(b)
		} else if cmd.Flags().Changed("description") {
			payload["description"] = updateDescription
		}
		if cmd.Flags().Changed("priority") {
			payload["priority"] = updatePriority
		}
		if cmd.Flags().Changed("due") {
			if updateDueDate == "none" {
				payload["dueDate"] = nil
			} else {
				payload["dueDate"] = updateDueDate
			}
		}

		if len(payload) == 0 {
			return fmt.Errorf("no fields to update. Use --title, --description, --description-file, --priority, or --due")
		}

		// Fetch card to get numeric ID
		data, err := client.Get("/api/cards/" + ticketID)
		if err != nil {
			return err
		}
		var c cardResponse
		if err := json.Unmarshal(data, &c); err != nil {
			return err
		}

		_, err = client.Put(fmt.Sprintf("/api/cards/%d", c.ID), payload)
		if err != nil {
			return fmt.Errorf("failed to update card: %w", err)
		}

		key := ""
		if c.Project != nil {
			key = c.Project.Key + "-"
		}
		fmt.Printf("Updated %s%d\n", key, c.ID)
		return nil
	},
}

func init() {
	updateCmd.Flags().StringVar(&updateTitle, "title", "", "New title")
	updateCmd.Flags().StringVar(&updateDescription, "description", "", "New description (markdown)")
	updateCmd.Flags().StringVar(&updateDescFile, "description-file", "", "Read description from file")
	updateCmd.Flags().StringVar(&updatePriority, "priority", "", "Priority: low, medium, high, urgent")
	updateCmd.Flags().StringVar(&updateDueDate, "due", "", "Due date (YYYY-MM-DD) or 'none' to clear")
	rootCmd.AddCommand(updateCmd)
}

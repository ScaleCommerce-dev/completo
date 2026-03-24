package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
)

var assignMe bool

var assignCmd = &cobra.Command{
	Use:   "assign <ticket-id> [user-email]",
	Short: "Assign a card to a user (or yourself with --me)",
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) < 1 {
			return fmt.Errorf("ticket ID required")
		}
		client := mustClient()
		ticketID := args[0]

		// Fetch card to get project
		data, err := client.Get("/api/cards/" + ticketID)
		if err != nil {
			return err
		}
		var c cardResponse
		if err := json.Unmarshal(data, &c); err != nil {
			return err
		}

		// Get project members to resolve email to user ID
		membersData, err := client.Get(fmt.Sprintf("/api/projects/%s/members", c.ProjectID))
		if err != nil {
			return err
		}
		var members []struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Email string `json:"email"`
			Role  string `json:"role"`
		}
		if err := json.Unmarshal(membersData, &members); err != nil {
			return err
		}

		var targetEmail string
		if assignMe {
			if cfg.User == "" {
				return fmt.Errorf("COMPLETO_USER not set. Run 'completo config' or set it in ~/.completo/.env")
			}
			targetEmail = cfg.User
		} else if len(args) >= 2 {
			targetEmail = args[1]
		} else {
			return fmt.Errorf("provide a user email or use --me")
		}

		var userID string
		var userName string
		for _, m := range members {
			if m.Email == targetEmail {
				userID = m.ID
				userName = m.Name
				break
			}
		}
		if userID == "" {
			fmt.Println("Available members:")
			for _, m := range members {
				fmt.Printf("  %s (%s)\n", m.Email, m.Name)
			}
			return fmt.Errorf("user %q not found in project members", targetEmail)
		}

		payload := map[string]any{
			"assigneeId": userID,
		}
		_, err = client.Put(fmt.Sprintf("/api/cards/%d", c.ID), payload)
		if err != nil {
			return fmt.Errorf("failed to assign card: %w", err)
		}

		key := ""
		if c.Project != nil {
			key = c.Project.Key + "-"
		}
		fmt.Printf("Assigned %s%d to %s\n", key, c.ID, userName)
		return nil
	},
}

func init() {
	assignCmd.Flags().BoolVar(&assignMe, "me", false, "Assign to yourself (uses COMPLETO_USER)")
	rootCmd.AddCommand(assignCmd)
}

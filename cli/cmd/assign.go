package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
)

var assignMe bool

var assignCmd = &cobra.Command{
	Use:   "assign <ticket-id> [member]",
	Short: "Assign a card to a project member by email, name or ID (or yourself with --me)",
	Long:  "Assign a card to a project member, matched by email, name or ID. Agents have no visible email, so name them or use their ID.",
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

		var ref string
		if assignMe {
			if cfg.User == "" {
				return fmt.Errorf("COMPLETO_USER not set. Run 'completo config' or set it in ~/.completo/.env")
			}
			ref = cfg.User
		} else if len(args) >= 2 {
			ref = args[1]
		} else {
			return fmt.Errorf("provide a member's email, name or ID, or use --me")
		}

		members, err := fetchMembers(client, c.ProjectID)
		if err != nil {
			return err
		}
		m, err := resolveMember(members, ref)
		if err != nil {
			return err
		}
		userID, userName := m.ID, m.Name

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

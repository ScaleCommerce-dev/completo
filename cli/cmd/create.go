package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	createStatus      string
	createDescription string
	createDescFile    string
	createPriority    string
	createDueDate     string
	createAssignMe    bool
	createProject     string
)

var createCmd = &cobra.Command{
	Use:   "create <title>",
	Short: "Create a new card",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		title := args[0]

		// Resolve project
		slug := createProject
		if slug == "" {
			slug = cfg.Project
		}
		if slug == "" {
			return fmt.Errorf("project required: use --project or set PROJECT in .completo")
		}

		proj, err := fetchProject(client, slug)
		if err != nil {
			return err
		}

		// Resolve status
		resolvedStatus, err := resolveCreateStatus(proj.Statuses, createStatus, cmd.Flags().Changed("status"), cfg.TodoStatus)
		if err != nil {
			if cmd.Flags().Changed("status") {
				fmt.Fprintln(os.Stderr, "Available statuses:")
				for _, st := range proj.Statuses {
					fmt.Fprintf(os.Stderr, "  %s\n", st.Name)
				}
			}
			return err
		}
		statusID := resolvedStatus.ID

		// Build payload
		payload := map[string]any{
			"statusId": statusID,
			"title":    title,
		}

		if cmd.Flags().Changed("description-file") {
			b, err := os.ReadFile(createDescFile)
			if err != nil {
				return fmt.Errorf("failed to read description file: %w", err)
			}
			payload["description"] = string(b)
		} else if cmd.Flags().Changed("description") {
			payload["description"] = createDescription
		}

		if cmd.Flags().Changed("priority") {
			switch createPriority {
			case "low", "medium", "high", "urgent":
				payload["priority"] = createPriority
			default:
				return fmt.Errorf("invalid priority %q: must be low, medium, high, or urgent", createPriority)
			}
		}

		if cmd.Flags().Changed("due") {
			payload["dueDate"] = createDueDate
		}

		// Resolve assignee if --assign-me
		if createAssignMe {
			if cfg.User == "" {
				return fmt.Errorf("COMPLETO_USER not set. Run 'completo config' or set it in ~/.completo/.env")
			}
			membersData, err := client.Get(fmt.Sprintf("/api/projects/%s/members", proj.ID))
			if err != nil {
				return err
			}
			var members []struct {
				ID    string `json:"id"`
				Email string `json:"email"`
			}
			if err := json.Unmarshal(membersData, &members); err != nil {
				return err
			}
			var userID string
			for _, m := range members {
				if m.Email == cfg.User {
					userID = m.ID
					break
				}
			}
			if userID == "" {
				return fmt.Errorf("user %q not found in project members", cfg.User)
			}
			payload["assigneeId"] = userID
		}

		// Create the card
		data, err := client.Post(fmt.Sprintf("/api/projects/%s/cards", proj.ID), payload)
		if err != nil {
			return fmt.Errorf("failed to create card: %w", err)
		}

		if jsonOutput {
			fmt.Println(string(data))
			return nil
		}

		var c card
		if err := json.Unmarshal(data, &c); err != nil {
			return fmt.Errorf("failed to parse card: %w", err)
		}

		// Resolve status from local data
		for _, s := range proj.Statuses {
			if s.ID == c.StatusID {
				c.Status = &status{ID: s.ID, Name: s.Name, Color: s.Color}
				break
			}
		}

		resp := &cardResponse{
			card:    c,
			Project: &projectInfo{Key: proj.Key},
		}

		fmt.Printf("Created %s-%d\n", proj.Key, c.ID)
		fmt.Print(formatCard(resp))
		return nil
	},
}

// resolveCreateStatus picks the status to use for a new card.
// Priority: explicit flag > config default > first status.
func resolveCreateStatus(statuses []status, flagValue string, flagChanged bool, configDefault string) (*status, error) {
	if len(statuses) == 0 {
		return nil, fmt.Errorf("project has no statuses")
	}
	if flagChanged {
		s := findStatusByName(statuses, flagValue)
		if s == nil {
			return nil, fmt.Errorf("status %q not found", flagValue)
		}
		return s, nil
	}
	if configDefault != "" {
		s := findStatusByName(statuses, configDefault)
		if s != nil {
			return s, nil
		}
	}
	return &statuses[0], nil
}

func init() {
	createCmd.Flags().StringVar(&createStatus, "status", "", "Status name (default: TODO_STATUS from .completo or first status)")
	createCmd.Flags().StringVar(&createDescription, "description", "", "Card description (markdown)")
	createCmd.Flags().StringVar(&createDescFile, "description-file", "", "Read description from file")
	createCmd.Flags().StringVar(&createPriority, "priority", "", "Priority: low, medium, high, urgent")
	createCmd.Flags().StringVar(&createDueDate, "due", "", "Due date (YYYY-MM-DD)")
	createCmd.Flags().BoolVar(&createAssignMe, "assign-me", false, "Assign to yourself (uses COMPLETO_USER)")
	createCmd.Flags().StringVar(&createProject, "project", "", "Project slug (default: PROJECT from .completo)")
	rootCmd.AddCommand(createCmd)
}

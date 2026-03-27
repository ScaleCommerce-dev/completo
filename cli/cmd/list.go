package cmd

import (
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

var (
	listStatus   string
	listPriority string
	listAssignee string
	listLimit    int
)

var listCmd = &cobra.Command{
	Use:   "list [project-slug]",
	Short: "List cards in a project, optionally filtered by status, priority, or assignee",
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

		opts := listCardsOpts{Limit: listLimit}

		if listStatus != "" {
			s := findStatusByName(proj.Statuses, listStatus)
			if s == nil {
				fmt.Printf("Status %q not found. Available statuses:\n", listStatus)
				for _, st := range proj.Statuses {
					fmt.Printf("  %s\n", st.Name)
				}
				return fmt.Errorf("status %q not found", listStatus)
			}
			opts.StatusID = s.ID
		}
		if listPriority != "" {
			opts.Priority = listPriority
		}
		if listAssignee != "" {
			opts.Assignee = listAssignee
		}

		return listCards(client, proj, opts)
	},
}

func init() {
	listCmd.Flags().StringVar(&listStatus, "status", "", "Filter by status name")
	listCmd.Flags().StringVar(&listPriority, "priority", "", "Filter by priority (low, medium, high, urgent)")
	listCmd.Flags().StringVar(&listAssignee, "assignee", "", "Filter by assignee name or ID")
	listCmd.Flags().IntVar(&listLimit, "limit", 50, "Maximum number of cards to return (1-200)")
	rootCmd.AddCommand(listCmd)
}

type listCardsOpts struct {
	StatusID string
	Priority string
	Assignee string
	Limit    int
}

func buildListPath(projectID string, opts listCardsOpts) string {
	params := url.Values{}
	params.Set("sort", "position")
	params.Set("order", "asc")
	if opts.StatusID != "" {
		params.Set("statusId", opts.StatusID)
	}
	if opts.Priority != "" {
		params.Set("priority", opts.Priority)
	}
	if opts.Assignee != "" {
		params.Set("assigneeId", opts.Assignee)
	}
	if opts.Limit > 0 {
		params.Set("limit", fmt.Sprintf("%d", opts.Limit))
	}
	return fmt.Sprintf("/api/projects/%s/cards?%s", projectID, params.Encode())
}

func listCards(client *internal.Client, proj *projectDetail, opts listCardsOpts) error {
	path := buildListPath(proj.ID, opts)
	data, err := client.Get(path)
	if err != nil {
		return err
	}

	if jsonOutput {
		fmt.Println(string(data))
		return nil
	}

	var cards []card
	if err := json.Unmarshal(data, &cards); err != nil {
		return fmt.Errorf("failed to parse cards: %w", err)
	}

	if len(cards) == 0 {
		fmt.Println("No cards found.")
		return nil
	}

	headers := []string{"TICKET", "TITLE", "STATUS", "PRIORITY"}
	rows := make([][]string, len(cards))
	for i, c := range cards {
		priority := ""
		if c.Priority != nil {
			priority = *c.Priority
		}
		statusName := ""
		if c.Status != nil {
			statusName = c.Status.Name
		}
		rows[i] = []string{fmt.Sprintf("%s-%d", proj.Key, c.ID), c.Title, statusName, priority}
	}
	fmt.Print(internal.FormatTable(headers, rows))
	return nil
}

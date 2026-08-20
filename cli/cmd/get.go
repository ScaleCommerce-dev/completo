package cmd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

type card struct {
	ID          int     `json:"id"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	Priority    *string `json:"priority"`
	DueDate     *string `json:"dueDate"`
	Position    int     `json:"position"`
	StatusID    string  `json:"statusId"`
	ProjectID   string  `json:"projectId"`
	AssigneeID  *string `json:"assigneeId"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	Status      *status `json:"status"`
	Assignee    *struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"assignee"`
	Tags            []tag `json:"tags"`
	AttachmentCount int   `json:"attachmentCount"`
}

type projectInfo struct {
	Key string `json:"key"`
}

type cardResponse struct {
	card
	Project  *projectInfo `json:"project"`
	Statuses []status     `json:"statuses"`
}

// resolveStatus finds the card's status from the statuses list returned by the API.
// The card detail endpoint returns all project statuses in a "statuses" array
// rather than a nested "status" object.
func (c *cardResponse) resolveStatus() string {
	if c.Status != nil {
		return c.Status.Name
	}
	for _, s := range c.Statuses {
		if s.ID == c.StatusID {
			return s.Name
		}
	}
	return ""
}

// fetchCard resolves a ticket reference ("TK-42") or numeric ID to the full card.
// Every mutation starts here: only `/api/cards/[id].get` accepts a ticket key —
// the nested card endpoints resolve their param with `Number()`, so a key has to
// be exchanged for the numeric `c.ID` first.
func fetchCard(client *internal.Client, ref string) (*cardResponse, error) {
	data, err := client.Get("/api/cards/" + ref)
	if err != nil {
		return nil, err
	}
	var c cardResponse
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("failed to parse card: %w", err)
	}
	return &c, nil
}

// ticket renders the card's display reference, falling back to the bare numeric
// ID when the response carried no project key.
func (c *cardResponse) ticket() string {
	if c.Project != nil && c.Project.Key != "" {
		return fmt.Sprintf("%s-%d", c.Project.Key, c.ID)
	}
	return fmt.Sprintf("%d", c.ID)
}

var getCmd = &cobra.Command{
	Use:   "get <ticket-id>",
	Short: "Fetch a card by ticket ID (e.g., TK-27) or numeric ID",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		if jsonOutput {
			data, err := client.Get("/api/cards/" + args[0])
			if err != nil {
				return err
			}
			fmt.Println(string(data))
			return nil
		}

		c, err := fetchCard(client, args[0])
		if err != nil {
			return err
		}

		fmt.Print(formatCard(c))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(getCmd)
}

func formatCard(c *cardResponse) string {
	statusName := c.resolveStatus()

	assignee := "none"
	if c.Assignee != nil {
		assignee = c.Assignee.Name
	}

	priority := "none"
	if c.Priority != nil {
		priority = *c.Priority
	}

	dueDate := "none"
	if c.DueDate != nil {
		dueDate = *c.DueDate
	}

	var tagNames []string
	for _, t := range c.Tags {
		tagNames = append(tagNames, t.Name)
	}
	tags := "none"
	if len(tagNames) > 0 {
		tags = strings.Join(tagNames, ", ")
	}

	fields := []internal.Field{
		{Key: "ticket", Value: c.ticket()},
		{Key: "title", Value: c.Title},
		{Key: "status", Value: statusName},
		{Key: "priority", Value: priority},
		{Key: "assignee", Value: assignee},
		{Key: "due", Value: dueDate},
		{Key: "tags", Value: tags},
		{Key: "attachments", Value: fmt.Sprintf("%d", c.AttachmentCount)},
	}

	desc := ""
	if c.Description != nil && *c.Description != "" {
		desc = *c.Description
	}
	if desc != "" {
		fields = append(fields, internal.Field{Key: "description", Value: desc})
	}

	return internal.FormatFields(fields, false)
}

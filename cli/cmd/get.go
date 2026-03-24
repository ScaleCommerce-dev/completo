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
	Tags []struct {
		ID    string  `json:"id"`
		Name  string  `json:"name"`
		Color *string `json:"color"`
	} `json:"tags"`
	AttachmentCount int `json:"attachmentCount"`
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

var getCmd = &cobra.Command{
	Use:   "get <ticket-id>",
	Short: "Fetch a card by ticket ID (e.g., TK-27) or numeric ID",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		data, err := client.Get("/api/cards/" + args[0])
		if err != nil {
			return err
		}

		if jsonOutput {
			fmt.Println(string(data))
			return nil
		}

		var c cardResponse
		if err := json.Unmarshal(data, &c); err != nil {
			return fmt.Errorf("failed to parse card: %w", err)
		}

		fmt.Print(formatCard(&c))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(getCmd)
}

func formatCard(c *cardResponse) string {
	ticket := fmt.Sprintf("%d", c.ID)
	if c.Project != nil && c.Project.Key != "" {
		ticket = fmt.Sprintf("%s-%d", c.Project.Key, c.ID)
	}

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
		{Key: "ticket", Value: ticket},
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

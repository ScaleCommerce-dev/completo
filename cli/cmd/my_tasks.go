package cmd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

var myTasksCmd = &cobra.Command{
	Use:   "my-tasks",
	Short: "List cards assigned to you",
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		data, err := client.Get("/api/my-tasks")
		if err != nil {
			return err
		}

		if jsonOutput {
			fmt.Println(string(data))
			return nil
		}

		var resp struct {
			Groups []struct {
				Project struct {
					Name string `json:"name"`
					Key  string `json:"key"`
				} `json:"project"`
				Cards []card `json:"cards"`
			} `json:"groups"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return err
		}

		if len(resp.Groups) == 0 {
			fmt.Println("No tasks assigned to you.")
			return nil
		}

		for _, g := range resp.Groups {
			fmt.Printf("\n%s\n%s\n", g.Project.Name, strings.Repeat("-", len(g.Project.Name)))

			headers := []string{"TICKET", "TITLE", "STATUS", "PRIORITY"}
			rows := make([][]string, len(g.Cards))
			for i, c := range g.Cards {
				ticket := fmt.Sprintf("%s-%d", g.Project.Key, c.ID)
				statusName := ""
				if c.Status != nil {
					statusName = c.Status.Name
				}
				priority := ""
				if c.Priority != nil {
					priority = *c.Priority
				}
				rows[i] = []string{ticket, c.Title, statusName, priority}
			}
			fmt.Print(internal.FormatTable(headers, rows))
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(myTasksCmd)
}

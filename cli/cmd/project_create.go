package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
)

var (
	projectCreateDesc     string
	projectCreateKey      string
	projectCreateSlug     string
	projectCreateIcon     string
	projectCreateDoneDays int
)

var projectCreateCmd = &cobra.Command{
	Use:   "project-create <name>",
	Short: "Create a new project",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		name := args[0]

		payload := map[string]any{
			"name": name,
		}

		if cmd.Flags().Changed("description") {
			payload["description"] = projectCreateDesc
		}
		if cmd.Flags().Changed("key") {
			payload["key"] = projectCreateKey
		}
		if cmd.Flags().Changed("slug") {
			payload["slug"] = projectCreateSlug
		}
		if cmd.Flags().Changed("icon") {
			payload["icon"] = projectCreateIcon
		}
		if cmd.Flags().Changed("done-retention-days") {
			payload["doneRetentionDays"] = projectCreateDoneDays
		}

		data, err := client.Post("/api/projects", payload)
		if err != nil {
			return fmt.Errorf("failed to create project: %w", err)
		}

		if jsonOutput {
			fmt.Println(string(data))
			return nil
		}

		var p struct {
			ID   string `json:"id"`
			Name string `json:"name"`
			Slug string `json:"slug"`
			Key  string `json:"key"`
		}
		if err := json.Unmarshal(data, &p); err != nil {
			return fmt.Errorf("failed to parse response: %w", err)
		}

		fmt.Printf("Created project %q (%s)\n", p.Name, p.Key)
		fmt.Printf("  Slug: %s\n", p.Slug)
		fmt.Printf("  ID:   %s\n", p.ID)
		fmt.Println("\nDefault statuses, tags, and board have been created.")
		fmt.Printf("\nTo use this project, add to your .completo file:\n")
		fmt.Printf("  PROJECT=%s\n", p.Slug)
		return nil
	},
}

func init() {
	projectCreateCmd.Flags().StringVar(&projectCreateDesc, "description", "", "Project description")
	projectCreateCmd.Flags().StringVar(&projectCreateKey, "key", "", "Project key (2-5 uppercase letters, auto-generated if omitted)")
	projectCreateCmd.Flags().StringVar(&projectCreateSlug, "slug", "", "Project slug (auto-generated if omitted)")
	projectCreateCmd.Flags().StringVar(&projectCreateIcon, "icon", "", "Project icon")
	projectCreateCmd.Flags().IntVar(&projectCreateDoneDays, "done-retention-days", 30, "Days to retain done cards (default 30)")
	rootCmd.AddCommand(projectCreateCmd)
}

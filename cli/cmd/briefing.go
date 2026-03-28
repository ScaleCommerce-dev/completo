package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var (
	briefingFiles []string
	briefingClear bool
)

var briefingCmd = &cobra.Command{
	Use:   "briefing [project-slug]",
	Short: "View or update the project's agent briefing",
	Long: `Manage the agent briefing for a project. The briefing provides context to AI
features like card description generation.

Without flags, prints the current briefing. Use --file to upload one or more
files as the briefing, or --clear to remove it.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		client := mustClient()
		slug := cfg.Project
		if len(args) > 0 {
			slug = args[0]
		}
		if slug == "" {
			return fmt.Errorf("project required: pass as argument or set PROJECT in .completo")
		}

		projID, err := resolveProjectID(client, slug)
		if err != nil {
			return err
		}

		// Clear briefing
		if briefingClear {
			payload := map[string]any{"briefing": nil}
			if _, err := client.Put(fmt.Sprintf("/api/projects/%s", projID), payload); err != nil {
				return err
			}
			fmt.Println("Briefing cleared.")
			return nil
		}

		// Upload file(s) as briefing
		if len(briefingFiles) > 0 {
			var parts []string
			for _, f := range briefingFiles {
				content, err := os.ReadFile(f)
				if err != nil {
					return fmt.Errorf("failed to read %q: %w", f, err)
				}
				if len(briefingFiles) > 1 {
					name := filepath.Base(f)
					parts = append(parts, fmt.Sprintf("## %s\n\n%s", name, strings.TrimSpace(string(content))))
				} else {
					parts = append(parts, strings.TrimSpace(string(content)))
				}
			}
			briefingText := strings.Join(parts, "\n\n---\n\n")

			payload := map[string]any{"briefing": briefingText}
			if _, err := client.Put(fmt.Sprintf("/api/projects/%s", projID), payload); err != nil {
				return err
			}
			fmt.Printf("Briefing updated from %d file(s) (%d bytes).\n", len(briefingFiles), len(briefingText))
			return nil
		}

		// View current briefing
		data, err := client.Get(fmt.Sprintf("/api/projects/%s", projID))
		if err != nil {
			return err
		}

		var proj struct {
			Briefing *string `json:"briefing"`
		}
		if err := json.Unmarshal(data, &proj); err != nil {
			return fmt.Errorf("failed to parse project: %w", err)
		}

		if jsonOutput {
			b, _ := json.MarshalIndent(map[string]any{"briefing": proj.Briefing}, "", "  ")
			fmt.Println(string(b))
			return nil
		}

		if proj.Briefing == nil || *proj.Briefing == "" {
			fmt.Println("No briefing set. Use --file to upload one.")
			return nil
		}
		fmt.Println(*proj.Briefing)
		return nil
	},
}

func init() {
	briefingCmd.Flags().StringArrayVar(&briefingFiles, "file", nil, "File(s) to upload as briefing (can be repeated)")
	briefingCmd.Flags().BoolVar(&briefingClear, "clear", false, "Clear the project briefing")
	rootCmd.AddCommand(briefingCmd)
}

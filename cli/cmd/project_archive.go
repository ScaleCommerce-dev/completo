package cmd

import (
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/spf13/cobra"
)

// Archiving hides a project from All Projects, the sidebar, search, My Tasks and
// the Calendar, and changes nothing else: its cards, statuses, tags and members
// stay, and it keeps working at its URL. Restoring is the exact reverse.
var projectArchiveCmd = &cobra.Command{
	Use:   "project-archive <project>",
	Short: "Archive a project (hides it; keeps all its data)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return setProjectArchived(args[0], true)
	},
}

var projectRestoreCmd = &cobra.Command{
	Use:   "project-restore <project>",
	Short: "Restore an archived project",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return setProjectArchived(args[0], false)
	},
}

func setProjectArchived(ref string, archive bool) error {
	client := mustClient()
	// Explicit, never the `.completo` default: archiving the project you happen
	// to be standing in, by omission, is not something to do by accident.
	id, err := resolveProjectID(client, ref)
	if err != nil {
		return err
	}

	path := "/api/projects/" + url.PathEscape(id) + "/archive"
	var data json.RawMessage
	if archive {
		data, err = client.Put(path, nil)
	} else {
		data, err = client.Delete(path)
	}
	if err != nil {
		verb := "restore"
		if archive {
			verb = "archive"
		}
		return fmt.Errorf("failed to %s project: %w", verb, err)
	}

	if jsonOutput {
		fmt.Println(string(data))
		return nil
	}

	var p project
	if err := json.Unmarshal(data, &p); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}
	if archive {
		fmt.Printf("Archived project %q (%s). Restore it with: completo project-restore %s\n", p.Name, p.Slug, p.Slug)
	} else {
		fmt.Printf("Restored project %q (%s)\n", p.Name, p.Slug)
	}
	return nil
}

func init() {
	rootCmd.AddCommand(projectArchiveCmd)
	rootCmd.AddCommand(projectRestoreCmd)
}

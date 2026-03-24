package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Configure Completo CLI credentials",
	Long:  "Interactively set up ~/.completo/.env with your Completo URL and API token.",
	RunE: func(cmd *cobra.Command, args []string) error {
		home, err := os.UserHomeDir()
		if err != nil {
			return err
		}
		dir := filepath.Join(home, ".completo")
		envPath := filepath.Join(dir, ".env")

		// Load existing values
		existing := map[string]string{}
		if f, err := os.Open(envPath); err == nil {
			scanner := bufio.NewScanner(f)
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				if k, v, ok := strings.Cut(line, "="); ok {
					existing[strings.TrimSpace(k)] = strings.TrimSpace(v)
				}
			}
			f.Close()
		}

		reader := bufio.NewReader(os.Stdin)

		url := prompt(reader, "Completo URL", existing["COMPLETO_URL"])
		tokenDefault := existing["COMPLETO_TOKEN"]
		tokenHint := ""
		if tokenDefault != "" {
			// Mask the token, only show prefix
			if len(tokenDefault) > 8 {
				tokenHint = tokenDefault[:8] + "..."
			} else {
				tokenHint = "****"
			}
		}
		token := prompt(reader, "API Token", tokenHint)
		if token == tokenHint {
			// User pressed enter without changing - keep existing token
			token = tokenDefault
		}
		user := prompt(reader, "Your email (for card assignment)", existing["COMPLETO_USER"])

		if err := os.MkdirAll(dir, 0700); err != nil {
			return fmt.Errorf("failed to create %s: %w", dir, err)
		}

		content := fmt.Sprintf("COMPLETO_URL=%s\nCOMPLETO_TOKEN=%s\nCOMPLETO_USER=%s\n", url, token, user)
		if err := os.WriteFile(envPath, []byte(content), 0600); err != nil {
			return fmt.Errorf("failed to write %s: %w", envPath, err)
		}

		fmt.Printf("Configuration saved to %s\n", envPath)
		return nil
	},
}

func prompt(reader *bufio.Reader, label, defaultVal string) string {
	if defaultVal != "" {
		fmt.Printf("%s [%s]: ", label, defaultVal)
	} else {
		fmt.Printf("%s: ", label)
	}
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(input)
	if input == "" {
		return defaultVal
	}
	return input
}

func init() {
	rootCmd.AddCommand(configCmd)
}

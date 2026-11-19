package cmd

import (
	"fmt"
	"os"

	"github.com/scalecommerce-dev/completo/cli/internal"
	"github.com/spf13/cobra"
)

var (
	Version   = "dev"
	BuildTime = "unknown"

	jsonOutput bool
	envFile    string
	cfg        *internal.Config
)

var rootCmd = &cobra.Command{
	Use:   "completo",
	Short: "CLI for Completo kanban board",
	Long:  "Interact with your Completo instance from the command line or AI agents.",
	// Errors are printed once, by Execute. Cobra's own copy came first, followed by
	// the usage text and then Execute's copy, so a failed upload printed its error
	// twice around a screen of flags.
	SilenceErrors: true,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		// Past argument and flag parsing, an error is the command's, not a usage
		// mistake, so the usage text would only bury it.
		cmd.SilenceUsage = true
		// Skip config loading for config and version commands
		if cmd.Name() == "config" || cmd.Name() == "version" || cmd.Name() == "self-update" {
			return nil
		}
		var err error
		cfg, err = internal.LoadConfig(envFile)
		if err != nil {
			return err
		}
		return nil
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().BoolVar(&jsonOutput, "json", false, "Output in JSON format")
	rootCmd.PersistentFlags().StringVar(&envFile, "env-file", "", "Path to env file for credentials/config override")
}

func mustClient() *internal.Client {
	client, err := internal.NewClient(cfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
	return client
}

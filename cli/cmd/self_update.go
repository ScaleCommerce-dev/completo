package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"

	"github.com/spf13/cobra"
)

const githubRepo = "scalecommerce-dev/completo"

var selfUpdateCmd = &cobra.Command{
	Use:   "self-update",
	Short: "Update completo CLI to the latest version",
	RunE: func(cmd *cobra.Command, args []string) error {
		if Version == "dev" {
			return fmt.Errorf("cannot self-update a dev build")
		}

		fmt.Println("Checking for updates...")

		latest, downloadURL, err := getLatestRelease()
		if err != nil {
			return fmt.Errorf("failed to check for updates: %w", err)
		}

		if compareSemver(Version, latest) >= 0 {
			fmt.Printf("Already up to date (%s)\n", Version)
			return nil
		}

		fmt.Printf("Updating %s -> %s\n", Version, latest)

		if downloadURL == "" {
			return fmt.Errorf("no binary found for %s/%s", runtime.GOOS, runtime.GOARCH)
		}

		// Download new binary
		resp, err := http.Get(downloadURL)
		if err != nil {
			return fmt.Errorf("download failed: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			return fmt.Errorf("download failed with status %d", resp.StatusCode)
		}

		// Write to temp file
		tmpFile, err := os.CreateTemp("", "completo-update-*")
		if err != nil {
			return err
		}
		defer os.Remove(tmpFile.Name())

		if _, err := io.Copy(tmpFile, resp.Body); err != nil {
			tmpFile.Close()
			return err
		}
		tmpFile.Close()

		if err := os.Chmod(tmpFile.Name(), 0755); err != nil {
			return err
		}

		// Replace current binary
		execPath, err := os.Executable()
		if err != nil {
			return err
		}

		oldPath := execPath + ".old"
		if err := os.Rename(execPath, oldPath); err != nil {
			return fmt.Errorf("failed to replace binary (try with sudo): %w", err)
		}
		if err := os.Rename(tmpFile.Name(), execPath); err != nil {
			// Restore old binary
			os.Rename(oldPath, execPath)
			return fmt.Errorf("failed to install new binary: %w", err)
		}
		os.Remove(oldPath)

		fmt.Printf("Updated to %s\n", latest)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(selfUpdateCmd)
}

func getLatestRelease() (version string, downloadURL string, err error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", githubRepo)
	resp, err := http.Get(url)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	var release struct {
		TagName string `json:"tag_name"`
		Assets  []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return "", "", err
	}

	// Find matching binary
	suffix := fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH)
	if runtime.GOOS == "windows" {
		suffix += ".exe"
	}

	for _, a := range release.Assets {
		if strings.Contains(a.Name, suffix) {
			return release.TagName, a.BrowserDownloadURL, nil
		}
	}

	return release.TagName, "", nil
}

func compareSemver(a, b string) int {
	a = strings.TrimPrefix(a, "v")
	b = strings.TrimPrefix(b, "v")

	// Strip pre-release suffix
	a, _, _ = strings.Cut(a, "-")
	b, _, _ = strings.Cut(b, "-")

	aParts := strings.Split(a, ".")
	bParts := strings.Split(b, ".")

	for i := 0; i < 3; i++ {
		var av, bv int
		if i < len(aParts) {
			av, _ = strconv.Atoi(aParts[i])
		}
		if i < len(bParts) {
			bv, _ = strconv.Atoi(bParts[i])
		}
		if av != bv {
			if av > bv {
				return 1
			}
			return -1
		}
	}
	return 0
}

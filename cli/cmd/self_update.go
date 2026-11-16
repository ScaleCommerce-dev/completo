package cmd

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

const githubRepo = "scalecommerce-dev/completo"

// httpClient bounds every request: without a timeout, a stalled connection hung
// self-update forever.
var httpClient = &http.Client{Timeout: 2 * time.Minute}

var selfUpdateCmd = &cobra.Command{
	Use:   "self-update",
	Short: "Update completo CLI to the latest version",
	RunE: func(cmd *cobra.Command, args []string) error {
		if Version == "dev" {
			return fmt.Errorf("cannot self-update a dev build")
		}

		fmt.Println("Checking for updates...")

		rel, err := getLatestRelease()
		if err != nil {
			return fmt.Errorf("failed to check for updates: %w", err)
		}

		if compareSemver(Version, rel.Version) >= 0 {
			fmt.Printf("Already up to date (%s)\n", Version)
			return nil
		}

		fmt.Printf("Updating %s -> %s\n", Version, rel.Version)

		if rel.BinaryURL == "" {
			return fmt.Errorf("no binary found for %s/%s", runtime.GOOS, runtime.GOARCH)
		}
		// Verified like install.sh does: the binary replaces the one on PATH that
		// holds the user's token, so an unverified download is not installed.
		if rel.ChecksumsURL == "" {
			return fmt.Errorf("release %s has no checksums.txt; refusing to install an unverified binary", rel.Version)
		}

		sums, err := download(rel.ChecksumsURL)
		if err != nil {
			return fmt.Errorf("failed to download checksums: %w", err)
		}
		binary, err := download(rel.BinaryURL)
		if err != nil {
			return fmt.Errorf("download failed: %w", err)
		}
		if err := verifyChecksum(binary, rel.BinaryName, sums); err != nil {
			return err
		}

		execPath, err := os.Executable()
		if err != nil {
			return err
		}
		if resolved, err := filepath.EvalSymlinks(execPath); err == nil {
			execPath = resolved
		}

		// Beside the binary, not in the system temp dir: a rename cannot cross
		// filesystems, and /tmp is often a different one.
		tmpFile, err := os.CreateTemp(filepath.Dir(execPath), ".completo-update-*")
		if err != nil {
			return fmt.Errorf("failed to replace binary (try with sudo): %w", err)
		}
		defer os.Remove(tmpFile.Name())

		if _, err := tmpFile.Write(binary); err != nil {
			tmpFile.Close()
			return err
		}
		if err := tmpFile.Close(); err != nil {
			return err
		}
		if err := os.Chmod(tmpFile.Name(), 0755); err != nil {
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

		fmt.Printf("Updated to %s\n", rel.Version)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(selfUpdateCmd)
}

type latestRelease struct {
	Version      string
	BinaryName   string
	BinaryURL    string
	ChecksumsURL string
}

func getLatestRelease() (*latestRelease, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", githubRepo)
	resp, err := httpClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// A rate-limited (403) or failed response decodes to an empty tag, which
	// compared as "Already up to date".
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub answered %s", resp.Status)
	}

	var release struct {
		TagName string `json:"tag_name"`
		Assets  []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}
	if release.TagName == "" {
		return nil, fmt.Errorf("the latest release has no tag")
	}

	rel := &latestRelease{Version: release.TagName}
	suffix := fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH)
	if runtime.GOOS == "windows" {
		suffix += ".exe"
	}
	for _, a := range release.Assets {
		switch {
		case a.Name == "checksums.txt":
			rel.ChecksumsURL = a.BrowserDownloadURL
		case strings.HasSuffix(a.Name, suffix):
			rel.BinaryName = a.Name
			rel.BinaryURL = a.BrowserDownloadURL
		}
	}
	return rel, nil
}

func download(url string) ([]byte, error) {
	resp, err := httpClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s answered %s", url, resp.Status)
	}
	return io.ReadAll(resp.Body)
}

// verifyChecksum checks data against name's line in a checksums.txt
// ("<sha256>  <filename>" per line, as the release job writes it).
func verifyChecksum(data []byte, name string, sums []byte) error {
	sum := sha256.Sum256(data)
	actual := hex.EncodeToString(sum[:])
	for _, line := range strings.Split(string(sums), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[1] == name {
			if strings.EqualFold(fields[0], actual) {
				return nil
			}
			return fmt.Errorf("checksum mismatch for %s: expected %s, got %s", name, fields[0], actual)
		}
	}
	return fmt.Errorf("%s is not listed in checksums.txt; refusing to install it", name)
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

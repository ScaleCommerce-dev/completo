package internal

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	// User-scoped (from ~/.completo/.env)
	URL   string
	Token string
	User  string

	// Project-scoped (from .completo in working dir)
	Project          string
	TodoStatus       string
	InProgressStatus string
	HandoffStatus    string
	Instructions     string
}

func LoadConfig(envFile string) (*Config, error) {
	cfg := &Config{}

	// Load user config from ~/.completo/.env
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("cannot determine home directory: %w", err)
	}
	userEnv := filepath.Join(home, ".completo", ".env")
	if vals, err := parseEnvFile(userEnv); err == nil {
		cfg.URL = vals["COMPLETO_URL"]
		cfg.Token = vals["COMPLETO_TOKEN"]
		cfg.User = vals["COMPLETO_USER"]
	}

	// What ~/.completo/.env pointed at: a project-directory file may name this server
	// without bringing a token of its own.
	userURL := cfg.URL
	var localFile, localURL, localToken string

	// Load project config from .completo in current or parent directories
	if projectFile := findProjectFile(); projectFile != "" {
		if vals, err := parseEnvFile(projectFile); err == nil {
			cfg.Project = vals["PROJECT"]
			cfg.TodoStatus = vals["TODO_STATUS"]
			cfg.InProgressStatus = vals["IN_PROGRESS_STATUS"]
			cfg.HandoffStatus = vals["HANDOFF_STATUS"]
			cfg.Instructions = vals["INSTRUCTIONS"]
		}

		// Load .completo.local alongside .completo (local dev overrides, gitignored)
		localFile = projectFile + ".local"
		if vals, err := parseEnvFile(localFile); err == nil {
			localURL, localToken = vals["COMPLETO_URL"], vals["COMPLETO_TOKEN"]
			applyValues(cfg, vals)
		}
	}

	// --env-file flag overrides everything except env vars
	if envFile != "" {
		vals, err := parseEnvFile(envFile)
		if err != nil {
			return nil, fmt.Errorf("failed to read env file %q: %w", envFile, err)
		}
		applyValues(cfg, vals)
		if vals["COMPLETO_URL"] != "" {
			localURL = "" // the flag chose the server, not the project directory
		}
	}

	// Environment variables are the final override
	if v := os.Getenv("COMPLETO_URL"); v != "" {
		cfg.URL = v
		localURL = ""
	}
	if v := os.Getenv("COMPLETO_TOKEN"); v != "" {
		cfg.Token = v
	}
	if v := os.Getenv("COMPLETO_USER"); v != "" {
		cfg.User = v
	}

	if err := checkLocalCredentials(cfg, userURL, localURL, localToken); err != nil {
		return nil, fmt.Errorf("%s: %w", localFile, err)
	}

	// Defaults
	if cfg.TodoStatus == "" {
		cfg.TodoStatus = "To Do"
	}
	if cfg.InProgressStatus == "" {
		cfg.InProgressStatus = "In Progress"
	}

	return cfg, nil
}

// checkLocalCredentials refuses a .completo.local that points the CLI at another
// server while the token comes from somewhere else. The file sits in a project
// directory, so it can arrive with a cloned repo or an archive. URL and token are a
// pair: a different URL must bring its own token, and that token must be the one
// actually sent. It is checked on the *final* values, after --env-file and the
// environment, because checking the file alone let it set COMPLETO_URL plus any
// dummy COMPLETO_TOKEN while an exported COMPLETO_TOKEN (the setup agents use)
// replaced the dummy and went to the file's server.
func checkLocalCredentials(cfg *Config, userURL, localURL, localToken string) error {
	if localURL == "" {
		return nil // the file did not choose the server
	}
	if localToken != "" && cfg.Token == localToken {
		return nil // the file's own token goes to the file's own server
	}
	if strings.TrimRight(localURL, "/") == strings.TrimRight(userURL, "/") {
		return nil // the server ~/.completo/.env already names
	}
	if localToken == "" {
		return fmt.Errorf("sets COMPLETO_URL=%s without COMPLETO_TOKEN; refusing to send your token from ~/.completo/.env to a different server. Add COMPLETO_TOKEN for that server, or remove COMPLETO_URL", localURL)
	}
	return fmt.Errorf("sets COMPLETO_URL=%s, but its COMPLETO_TOKEN is overridden (by --env-file or the COMPLETO_TOKEN environment variable); refusing to send that token to the file's server. Unset the override, or set COMPLETO_URL in the environment too", localURL)
}

// applyValues applies recognized keys from a parsed env map to the config.
func applyValues(cfg *Config, vals map[string]string) {
	if v := vals["COMPLETO_URL"]; v != "" {
		cfg.URL = v
	}
	if v := vals["COMPLETO_TOKEN"]; v != "" {
		cfg.Token = v
	}
	if v := vals["COMPLETO_USER"]; v != "" {
		cfg.User = v
	}
	if v := vals["PROJECT"]; v != "" {
		cfg.Project = v
	}
	if v := vals["TODO_STATUS"]; v != "" {
		cfg.TodoStatus = v
	}
	if v := vals["IN_PROGRESS_STATUS"]; v != "" {
		cfg.InProgressStatus = v
	}
	if v := vals["HANDOFF_STATUS"]; v != "" {
		cfg.HandoffStatus = v
	}
	if v := vals["INSTRUCTIONS"]; v != "" {
		cfg.Instructions = v
	}
}

func (c *Config) Validate() error {
	if c.URL == "" {
		return fmt.Errorf("COMPLETO_URL not set. Run 'completo config' or set it in ~/.completo/.env")
	}
	if c.Token == "" {
		return fmt.Errorf("COMPLETO_TOKEN not set. Run 'completo config' or set it in ~/.completo/.env")
	}
	return nil
}

func findProjectFile() string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		path := filepath.Join(dir, ".completo")
		if _, err := os.Stat(path); err == nil {
			return path
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

func parseEnvFile(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	vals := make(map[string]string)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		val = strings.TrimSpace(val)
		// Strip surrounding quotes
		if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
			val = val[1 : len(val)-1]
		}
		vals[key] = val
	}
	return vals, scanner.Err()
}

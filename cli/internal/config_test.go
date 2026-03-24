package internal

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseEnvFile(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, ".env")

	content := `# Comment line
COMPLETO_URL=https://example.com
COMPLETO_TOKEN=abc123

# Another comment
QUOTED_DOUBLE="hello world"
QUOTED_SINGLE='single quoted'
EQUALS_IN_VALUE=key=value=extra
SPACES_AROUND = trimmed
EMPTY_LINE_ABOVE=yes
`
	if err := os.WriteFile(envFile, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}

	vals, err := parseEnvFile(envFile)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		key, want string
	}{
		{"COMPLETO_URL", "https://example.com"},
		{"COMPLETO_TOKEN", "abc123"},
		{"QUOTED_DOUBLE", "hello world"},
		{"QUOTED_SINGLE", "single quoted"},
		{"EQUALS_IN_VALUE", "key=value=extra"},
		{"SPACES_AROUND", "trimmed"},
		{"EMPTY_LINE_ABOVE", "yes"},
	}

	for _, tt := range tests {
		got := vals[tt.key]
		if got != tt.want {
			t.Errorf("parseEnvFile[%q] = %q, want %q", tt.key, got, tt.want)
		}
	}

	// Comments and blank lines should not appear as keys
	if _, ok := vals["# Comment line"]; ok {
		t.Error("comment line parsed as key")
	}
}

func TestParseEnvFile_NotFound(t *testing.T) {
	_, err := parseEnvFile("/nonexistent/path/.env")
	if err == nil {
		t.Error("expected error for missing file")
	}
}

func TestConfigEnvOverrides(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, ".completo", ".env")
	os.MkdirAll(filepath.Dir(envFile), 0700)
	os.WriteFile(envFile, []byte("COMPLETO_URL=https://file.com\nCOMPLETO_TOKEN=file-token\n"), 0600)

	// Override HOME to use temp dir
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", dir)
	defer os.Setenv("HOME", origHome)

	// Set env var override
	os.Setenv("COMPLETO_URL", "https://env.com")
	defer os.Unsetenv("COMPLETO_URL")
	os.Setenv("COMPLETO_TOKEN", "")
	defer os.Unsetenv("COMPLETO_TOKEN")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}

	// Env var should override file value
	if cfg.URL != "https://env.com" {
		t.Errorf("URL = %q, want %q (env override)", cfg.URL, "https://env.com")
	}
	// Empty env var should NOT override (only non-empty overrides)
	if cfg.Token != "file-token" {
		t.Errorf("Token = %q, want %q (file value preserved)", cfg.Token, "file-token")
	}
}

func TestConfigDefaults(t *testing.T) {
	// Use a temp dir with no config files
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", t.TempDir())
	defer os.Setenv("HOME", origHome)

	// Clear any env overrides
	for _, k := range []string{"COMPLETO_URL", "COMPLETO_TOKEN", "COMPLETO_USER"} {
		os.Unsetenv(k)
	}

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}

	if cfg.TodoStatus != "To Do" {
		t.Errorf("TodoStatus = %q, want %q", cfg.TodoStatus, "To Do")
	}
	if cfg.InProgressStatus != "In Progress" {
		t.Errorf("InProgressStatus = %q, want %q", cfg.InProgressStatus, "In Progress")
	}
}

func TestFindProjectFile(t *testing.T) {
	// Create nested directory with .completo in parent
	dir := t.TempDir()
	// Resolve symlinks (macOS /var -> /private/var)
	dir, _ = filepath.EvalSymlinks(dir)

	os.WriteFile(filepath.Join(dir, ".completo"), []byte("PROJECT=test-proj\n"), 0600)
	child := filepath.Join(dir, "src", "deep")
	os.MkdirAll(child, 0755)

	// Change to child dir
	origDir, _ := os.Getwd()
	os.Chdir(child)
	defer os.Chdir(origDir)

	found := findProjectFile()
	if found == "" {
		t.Fatal("findProjectFile returned empty, expected parent's .completo")
	}
	foundDir, _ := filepath.EvalSymlinks(filepath.Dir(found))
	if foundDir != dir {
		t.Errorf("found %q, expected file in %q", found, dir)
	}
}

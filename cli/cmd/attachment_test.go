package cmd

import (
	"path/filepath"
	"strings"
	"testing"
)

func attachmentFixtures() []attachment {
	return []attachment{
		{ID: "3f2a1b9c-1111-4000-8000-000000000001", OriginalName: "report.csv", Size: 120},
		{ID: "3f2a1b9c-2222-4000-8000-000000000002", OriginalName: "shot.png", Size: 2048},
		{ID: "7c1d0e4f-3333-4000-8000-000000000003", OriginalName: "dup.txt", Size: 1},
		{ID: "8d2e1f50-4444-4000-8000-000000000004", OriginalName: "dup.txt", Size: 2},
	}
}

func TestResolveAttachmentRef(t *testing.T) {
	list := attachmentFixtures()
	for ref, want := range map[string]string{
		"3f2a1b9c-2222-4000-8000-000000000002": "shot.png",
		"7c1d":                                 "dup.txt",
		"report.csv":                           "report.csv",
	} {
		got, err := resolveAttachmentRef(list, ref)
		if err != nil || got.OriginalName != want {
			t.Errorf("%q: got %v, %v; want %s", ref, got, err, want)
		}
	}
	for ref, msg := range map[string]string{
		"3f2a1b9c": "more than one",
		"dup.txt":  "more than one",
		"nope":     "no attachment",
		"":         "required",
	} {
		if _, err := resolveAttachmentRef(list, ref); err == nil || !strings.Contains(err.Error(), msg) {
			t.Errorf("%q: got %v, want error containing %q", ref, err, msg)
		}
	}
}

func TestDownloadTargetStaysInTheChosenDirectory(t *testing.T) {
	dir := t.TempDir()
	for name, want := range map[string]string{
		"report.csv":         "report.csv",
		"../../etc/passwd":   "passwd",
		`..\..\win.ini`:      "win.ini",
		"/abs/path/file.txt": "file.txt",
		"..":                 "attachment",
	} {
		if got := downloadTarget("", name); got != want {
			t.Errorf("cwd, %q: got %q, want %q", name, got, want)
		}
		if got := downloadTarget(dir, name); got != filepath.Join(dir, want) {
			t.Errorf("dir, %q: got %q, want %q", name, got, filepath.Join(dir, want))
		}
	}
	file := filepath.Join(dir, "chosen.bin")
	if got := downloadTarget(file, "report.csv"); got != file {
		t.Errorf("explicit file: got %q, want %q", got, file)
	}
}

func TestUploadContentType(t *testing.T) {
	// The server's allowlist matches image/*, text/* and PDF on the declared type,
	// so these must not go out as octet-stream.
	for name, prefix := range map[string]string{
		"shot.PNG":   "image/png",
		"notes.txt":  "text/plain",
		"doc.pdf":    "application/pdf",
		"blob.weird": "application/octet-stream",
	} {
		if got := uploadContentType(name); !strings.HasPrefix(got, prefix) {
			t.Errorf("%s: got %q, want %q", name, got, prefix)
		}
	}
}

func TestFormatAttachments(t *testing.T) {
	if got := formatAttachments(nil); got != "No attachments.\n" {
		t.Errorf("empty: %q", got)
	}
	out := formatAttachments(attachmentFixtures()[:2])
	for _, want := range []string{"3f2a1b9c  report.csv", "120 B", "2.0 KB", "(deleted user)"} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
	if strings.Contains(out, "3f2a1b9c-1111") {
		t.Errorf("full id printed:\n%s", out)
	}
}

func TestCheckTicketKey(t *testing.T) {
	c := &cardResponse{card: card{ID: 42}, Project: &projectInfo{Key: "TK"}}
	for _, ref := range []string{"TK-42", "tk-42", "42"} {
		if err := checkTicketKey(ref, c); err != nil {
			t.Errorf("%s: %v", ref, err)
		}
	}
	err := checkTicketKey("AB-42", c)
	if err == nil || !strings.Contains(err.Error(), "TK-42") {
		t.Errorf("AB-42: got %v, want a refusal naming TK-42", err)
	}
}

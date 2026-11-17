package cmd

import (
	"strings"
	"testing"
)

func TestResolveMember(t *testing.T) {
	email := func(s string) *string { return &s }
	members := []member{
		{ID: "u1", Name: "Ada Lovelace", Email: email("ada@example.com"), Kind: "human"},
		{ID: "u2", Name: "Reviewer", Kind: "agent"},
		{ID: "u3", Name: "sam", Email: email("sam1@example.com"), Kind: "human"},
		{ID: "u4", Name: "Sam", Email: email("sam2@example.com"), Kind: "human"},
	}
	for ref, want := range map[string]string{
		"ADA@example.com": "u1", // email ignores case
		"u2":              "u2", // an agent by ID
		"reviewer":        "u2", // an agent by name, whose email is hidden
		"Sam":             "u4", // an exact name wins over a case-insensitive one
		" Ada Lovelace ":  "u1",
	} {
		m, err := resolveMember(members, ref)
		if err != nil || m.ID != want {
			t.Errorf("resolveMember(%q) = %v, %v; want %s", ref, m, err, want)
		}
	}
	if _, err := resolveMember(members, "SAM"); err == nil || !strings.Contains(err.Error(), "more than one") {
		t.Errorf("an ambiguous name is refused, got %v", err)
	}
	if _, err := resolveMember(members, "nobody"); err == nil || !strings.Contains(err.Error(), "Reviewer (agent)") {
		t.Errorf("an unknown member lists who is there, got %v", err)
	}
}

func TestRequirePriority(t *testing.T) {
	if p, err := requirePriority(" High "); err != nil || p != "high" {
		t.Errorf("got %q, %v", p, err)
	}
	if _, err := requirePriority("bogus"); err == nil {
		t.Error("an unknown priority is refused rather than silently ignored")
	}
}

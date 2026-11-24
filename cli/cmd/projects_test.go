package cmd

import "testing"

func TestListedProjects(t *testing.T) {
	when := "2026-11-24T10:00:00.000Z"
	all := []project{
		{Slug: "live"},
		{Slug: "old", ArchivedAt: &when},
	}
	if got := listedProjects(all, false); len(got) != 1 || got[0].Slug != "live" {
		t.Errorf("archived projects are left out by default, got %+v", got)
	}
	if got := listedProjects(all, true); len(got) != 2 {
		t.Errorf("--archived lists every project, got %+v", got)
	}
}

package internal

import (
	"strings"
	"testing"
)

func TestFormatFields(t *testing.T) {
	fields := []Field{
		{Key: "ticket", Value: "TK-42"},
		{Key: "title", Value: "Fix login bug"},
		{Key: "status", Value: "To Do"},
	}

	result := FormatFields(fields, false)

	// All keys should be present
	if !strings.Contains(result, "ticket:") {
		t.Error("missing ticket key")
	}
	if !strings.Contains(result, "TK-42") {
		t.Error("missing ticket value")
	}
	if !strings.Contains(result, "Fix login bug") {
		t.Error("missing title value")
	}
}

func TestFormatFieldsMultiline(t *testing.T) {
	fields := []Field{
		{Key: "title", Value: "Card"},
		{Key: "description", Value: "line 1\nline 2\nline 3"},
	}

	result := FormatFields(fields, false)

	// Multi-line values should be indented
	if !strings.Contains(result, "description:\n") {
		t.Error("multi-line value should have key on its own line")
	}
	if !strings.Contains(result, "  line 1\n") {
		t.Error("multi-line value lines should be indented")
	}
}

func TestFormatFieldsJSON(t *testing.T) {
	fields := []Field{
		{Key: "ticket", Value: "TK-1"},
		{Key: "title", Value: "Test"},
	}

	result := FormatFields(fields, true)

	if !strings.Contains(result, `"ticket": "TK-1"`) {
		t.Errorf("JSON output missing expected content: %s", result)
	}
}

func TestFormatTable(t *testing.T) {
	headers := []string{"TICKET", "TITLE", "STATUS"}
	rows := [][]string{
		{"TK-1", "Short", "Done"},
		{"TK-2", "A longer title here", "In Progress"},
	}

	result := FormatTable(headers, rows)

	lines := strings.Split(strings.TrimRight(result, "\n"), "\n")
	if len(lines) != 4 { // header + separator + 2 rows
		t.Errorf("expected 4 lines, got %d: %v", len(lines), lines)
	}

	// Header line
	if !strings.Contains(lines[0], "TICKET") || !strings.Contains(lines[0], "TITLE") {
		t.Errorf("header missing expected columns: %s", lines[0])
	}

	// Separator line
	if !strings.Contains(lines[1], "---") {
		t.Errorf("separator line missing dashes: %s", lines[1])
	}

	// Data rows
	if !strings.Contains(lines[2], "TK-1") || !strings.Contains(lines[2], "Short") {
		t.Errorf("row 1 missing data: %s", lines[2])
	}
	if !strings.Contains(lines[3], "TK-2") || !strings.Contains(lines[3], "In Progress") {
		t.Errorf("row 2 missing data: %s", lines[3])
	}
}

func TestFormatTableAlignment(t *testing.T) {
	headers := []string{"A", "B"}
	rows := [][]string{
		{"short", "x"},
		{"a much longer value", "y"},
	}

	result := FormatTable(headers, rows)
	lines := strings.Split(strings.TrimRight(result, "\n"), "\n")

	// All "B"/"x"/"y" values should start at the same column
	headerBPos := strings.Index(lines[0], "B")
	row1BPos := strings.Index(lines[2], "x")
	row2BPos := strings.Index(lines[3], "y")

	if headerBPos != row1BPos || headerBPos != row2BPos {
		t.Errorf("columns not aligned: header=%d, row1=%d, row2=%d", headerBPos, row1BPos, row2BPos)
	}
}

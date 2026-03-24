package cmd

import "testing"

func TestCompareSemver(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{"v0.1.0", "v0.1.0", 0},
		{"v0.2.0", "v0.1.0", 1},
		{"v0.1.0", "v0.2.0", -1},
		{"v0.10.0", "v0.9.0", 1},
		{"v1.0.0", "v0.99.99", 1},
		{"v0.1.1", "v0.1.0", 1},
		{"v0.1.0", "v0.1.1", -1},
		// Without v prefix
		{"0.1.0", "0.1.0", 0},
		{"1.0.0", "0.1.0", 1},
		// Pre-release suffix stripped
		{"v0.2.0-beta", "v0.1.0", 1},
		{"v0.1.0-rc1", "v0.1.0", 0},
		// Partial versions
		{"v1", "v0.9.9", 1},
		{"v0.1", "v0.1.0", 0},
	}

	for _, tt := range tests {
		got := compareSemver(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("compareSemver(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
		}
	}
}

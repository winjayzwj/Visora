package server

import "testing"

func TestLoadConfigRejectsMissingAndUnsafeValues(t *testing.T) {
	valid := map[string]string{
		"VISORA_MONGO_URI":       "mongodb://127.0.0.1:32768/?directConnection=true&replicaSet=visora-test",
		"VISORA_MONGO_DATABASE":  "visora_test_config",
		"VISORA_ALLOWED_ORIGINS": "http://127.0.0.1:5173",
		"VISORA_LISTEN_ADDR":     "127.0.0.1:8080",
		"VISORA_SESSION_TTL":     "1h",
		"VISORA_REQUEST_TIMEOUT": "5s",
		"VISORA_MAX_BODY_BYTES":  "4096",
		"VISORA_PAGE_SIZE":       "20",
	}
	getenv := func(values map[string]string) func(string) string {
		return func(key string) string { return values[key] }
	}

	if _, err := LoadConfig(getenv(valid)); err != nil {
		t.Fatalf("valid local configuration rejected: %v", err)
	}

	for name, mutate := range map[string]func(map[string]string){
		"missing required boundary":   func(values map[string]string) { values["VISORA_SESSION_TTL"] = "" },
		"non-loopback listen address": func(values map[string]string) { values["VISORA_LISTEN_ADDR"] = "0.0.0.0:8080" },
		"non-loopback HTTP origin":    func(values map[string]string) { values["VISORA_ALLOWED_ORIGINS"] = "http://example.com" },
		"mixed cookie security": func(values map[string]string) {
			values["VISORA_ALLOWED_ORIGINS"] = "http://127.0.0.1:5173,https://127.0.0.1:8443"
		},
		"zero body limit": func(values map[string]string) { values["VISORA_MAX_BODY_BYTES"] = "0" },
		"zero page size":  func(values map[string]string) { values["VISORA_PAGE_SIZE"] = "0" },
	} {
		t.Run(name, func(t *testing.T) {
			values := make(map[string]string, len(valid))
			for key, value := range valid {
				values[key] = value
			}
			mutate(values)
			if _, err := LoadConfig(getenv(values)); err == nil {
				t.Fatal("unsafe configuration was accepted")
			}
		})
	}
}

func TestOriginsRequireOneHTTPCookieHost(t *testing.T) {
	for _, value := range []string{
		"http://localhost:5173,http://127.0.0.1:5174",
		"http://127.0.0.1:5173,http://[::1]:5174",
		"http://localhost:5173,http://[::1]:5174",
		"http://127.0.0.1:5173,http://127.0.0.2:5174",
	} {
		if _, _, err := parseOrigins(value); err == nil {
			t.Errorf("mixed cookie hosts accepted: %s", value)
		}
	}
	for _, value := range []string{
		"http://127.0.0.1:5173,http://127.0.0.1:5174",
		"http://localhost:5173,http://localhost:5174",
		"http://[::1]:5173,http://[::1]:5174",
	} {
		if _, _, err := parseOrigins(value); err != nil {
			t.Errorf("same host rejected: %s: %v", value, err)
		}
	}
}

func TestHTTPSOriginsRequireOneCookieHost(t *testing.T) {
	if _, _, err := parseOrigins("https://app.example.test,https://admin.example.test"); err == nil {
		t.Fatal("different HTTPS cookie hosts were accepted")
	}
	if _, secure, err := parseOrigins("https://visora.example.test,https://visora.example.test:8443"); err != nil || !secure {
		t.Fatalf("same HTTPS host with different ports must use Secure cookies: secure=%v err=%v", secure, err)
	}
}

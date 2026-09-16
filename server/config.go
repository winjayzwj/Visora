package server

import (
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	MongoURI       string
	MongoDatabase  string
	AllowedOrigins map[string]struct{}
	ListenAddr     string
	SessionTTL     time.Duration
	RequestTimeout time.Duration
	MaxBodyBytes   int64
	PageSize       int64
	CookieSecure   bool
}

func LoadConfig(getenv func(string) string) (Config, error) {
	if getenv == nil {
		return Config{}, fmt.Errorf("environment reader is required")
	}
	config := Config{
		MongoURI:      strings.TrimSpace(getenv("VISORA_MONGO_URI")),
		MongoDatabase: strings.TrimSpace(getenv("VISORA_MONGO_DATABASE")),
		ListenAddr:    strings.TrimSpace(getenv("VISORA_LISTEN_ADDR")),
	}
	if config.MongoURI == "" || config.MongoDatabase == "" || config.ListenAddr == "" {
		return Config{}, fmt.Errorf("VISORA_MONGO_URI, VISORA_MONGO_DATABASE, and VISORA_LISTEN_ADDR are required")
	}
	if !isLoopbackAddr(config.ListenAddr) {
		return Config{}, fmt.Errorf("VISORA_LISTEN_ADDR must bind a loopback address")
	}

	var err error
	if config.SessionTTL, err = positiveDuration("VISORA_SESSION_TTL", getenv("VISORA_SESSION_TTL")); err != nil {
		return Config{}, err
	}
	if config.RequestTimeout, err = positiveDuration("VISORA_REQUEST_TIMEOUT", getenv("VISORA_REQUEST_TIMEOUT")); err != nil {
		return Config{}, err
	}
	if config.MaxBodyBytes, err = positiveInt("VISORA_MAX_BODY_BYTES", getenv("VISORA_MAX_BODY_BYTES")); err != nil {
		return Config{}, err
	}
	if config.PageSize, err = positiveInt("VISORA_PAGE_SIZE", getenv("VISORA_PAGE_SIZE")); err != nil {
		return Config{}, err
	}
	if config.AllowedOrigins, config.CookieSecure, err = parseOrigins(getenv("VISORA_ALLOWED_ORIGINS")); err != nil {
		return Config{}, err
	}
	return config, nil
}

func positiveDuration(name, value string) (time.Duration, error) {
	duration, err := time.ParseDuration(strings.TrimSpace(value))
	if err != nil || duration <= 0 {
		return 0, fmt.Errorf("%s must be a positive Go duration", name)
	}
	return duration, nil
}

func positiveInt(name, value string) (int64, error) {
	number, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil || number <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", name)
	}
	return number, nil
}

func parseOrigins(value string) (map[string]struct{}, bool, error) {
	origins := make(map[string]struct{})
	var scheme string
	var cookieHost string
	for _, raw := range strings.Split(value, ",") {
		origin := strings.TrimSpace(raw)
		parsed, err := url.ParseRequestURI(origin)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, false, fmt.Errorf("VISORA_ALLOWED_ORIGINS must contain exact origins")
		}
		if parsed.Scheme != "http" && parsed.Scheme != "https" {
			return nil, false, fmt.Errorf("VISORA_ALLOWED_ORIGINS only supports http or https origins")
		}
		if parsed.Scheme == "http" && !isLoopbackHost(parsed.Hostname()) {
			return nil, false, fmt.Errorf("HTTP origins must use a loopback host")
		}
		host := strings.ToLower(parsed.Hostname())
		if cookieHost != "" && cookieHost != host {
			return nil, false, fmt.Errorf("origins must share one cookie host")
		}
		cookieHost = host
		if scheme != "" && scheme != parsed.Scheme {
			return nil, false, fmt.Errorf("VISORA_ALLOWED_ORIGINS cannot mix HTTP and HTTPS")
		}
		scheme = parsed.Scheme
		origins[origin] = struct{}{}
	}
	if len(origins) == 0 {
		return nil, false, fmt.Errorf("VISORA_ALLOWED_ORIGINS is required")
	}
	return origins, scheme == "https", nil
}

func isLoopbackAddr(address string) bool {
	host, port, err := net.SplitHostPort(address)
	if err != nil || host == "" || port == "" {
		return false
	}
	number, err := strconv.ParseUint(port, 10, 16)
	return err == nil && number <= 65535 && isLoopbackHost(host)
}

func isLoopbackHost(host string) bool {
	host = strings.TrimSuffix(strings.ToLower(host), ".")
	if host == "localhost" {
		return true
	}
	if zone := strings.IndexByte(host, '%'); zone >= 0 {
		host = host[:zone]
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

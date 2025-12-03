package cache

import (
	"container/list"
	"sync"
	"time"
)

// Cache interface for caching LLM responses
type Cache interface {
	Get(key string) ([]byte, bool)
	Set(key string, value []byte)
	Delete(key string)
	Clear()
	Stats() CacheStats
}

type CacheStats struct {
	Hits   int64
	Misses int64
	Size   int
}

// MemoryCache implements an in-memory LRU cache with TTL
type MemoryCache struct {
	maxSize  int
	ttl      time.Duration
	mu       sync.RWMutex
	items    map[string]*cacheItem
	lru      *list.List
	hits     int64
	misses   int64
}

type cacheItem struct {
	key       string
	value     []byte
	expiresAt time.Time
	element   *list.Element
}

func NewMemoryCache(maxSizeMB int, ttl time.Duration) *MemoryCache {
	c := &MemoryCache{
		maxSize: maxSizeMB * 1024 * 1024, // Convert to bytes
		ttl:     ttl,
		items:   make(map[string]*cacheItem),
		lru:     list.New(),
	}

	// Start cleanup goroutine
	go c.cleanup()

	return c
}

func (c *MemoryCache) Get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	item, ok := c.items[key]
	if !ok {
		c.misses++
		return nil, false
	}

	// Check expiration
	if time.Now().After(item.expiresAt) {
		c.removeItem(item)
		c.misses++
		return nil, false
	}

	// Move to front of LRU
	c.lru.MoveToFront(item.element)
	c.hits++

	return item.value, true
}

func (c *MemoryCache) Set(key string, value []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check if item already exists
	if item, ok := c.items[key]; ok {
		item.value = value
		item.expiresAt = time.Now().Add(c.ttl)
		c.lru.MoveToFront(item.element)
		return
	}

	// Evict if necessary
	for c.currentSize()+len(value) > c.maxSize && c.lru.Len() > 0 {
		c.evictOldest()
	}

	// Add new item
	item := &cacheItem{
		key:       key,
		value:     value,
		expiresAt: time.Now().Add(c.ttl),
	}
	item.element = c.lru.PushFront(key)
	c.items[key] = item
}

func (c *MemoryCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if item, ok := c.items[key]; ok {
		c.removeItem(item)
	}
}

func (c *MemoryCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.items = make(map[string]*cacheItem)
	c.lru = list.New()
}

func (c *MemoryCache) Stats() CacheStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return CacheStats{
		Hits:   c.hits,
		Misses: c.misses,
		Size:   len(c.items),
	}
}

func (c *MemoryCache) currentSize() int {
	size := 0
	for _, item := range c.items {
		size += len(item.value)
	}
	return size
}

func (c *MemoryCache) evictOldest() {
	if elem := c.lru.Back(); elem != nil {
		key := elem.Value.(string)
		if item, ok := c.items[key]; ok {
			c.removeItem(item)
		}
	}
}

func (c *MemoryCache) removeItem(item *cacheItem) {
	c.lru.Remove(item.element)
	delete(c.items, item.key)
}

func (c *MemoryCache) cleanup() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.mu.Lock()
		now := time.Now()
		for key, item := range c.items {
			if now.After(item.expiresAt) {
				c.removeItem(item)
				delete(c.items, key)
			}
		}
		c.mu.Unlock()
	}
}

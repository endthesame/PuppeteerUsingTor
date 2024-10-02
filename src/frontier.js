class URLFrontier {
    constructor() {
        this.visited = new Set(); // Set of visited URLs
        this.queue = []; // Queue for BFS traversal
    }

    addUrl(url) {
        if (!this.visited.has(url)) {
            this.queue.push(url);
        }
    }

    getNextUrl() {
        return this.queue.shift();
    }

    markVisited(url) {
        this.visited.add(url);
    }

    hasMoreUrls() {
        return this.queue.length > 0;
    }
}

module.exports = URLFrontier;

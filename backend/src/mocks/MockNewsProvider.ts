import { type NewsItem, type NewsProvider, MAX_NEWS_ITEMS} from "../types/index.js";
import { shuffleArray } from "../utils/functions.js";
/**
 * Mock implementation of NewsProvider that generates realistic fake news items.
 *
 * In production, this would be replaced with an RSS feed parser or a news API
 * client (e.g., NewsAPI, GDELT). The MockNewsProvider allows the PoC to run
 * without external dependencies.
 */
export class MockNewsProvider implements NewsProvider {
    private readonly today: string = new Date().toISOString();

    private readonly allNews: NewsItem[] = [
        // ----- Technology -----
        /*
        {
            headline: "Google unveils new AI chip for data centers",
            summary: "Tensor G3 processor delivers 40% faster inference for enterprise AI workloads.",
            source: "TechCrunch",
            url: "https://techcrunch.com/2026/google-ai-chip",
            topic: "technology",
            publishedAt: this.today,
        },
        {
            headline: "Open-source AI model reaches human-level coding",
            summary: "Researchers release open model that writes production code at human proficiency.",
            source: "Ars Technica",
            url: "https://arstechnica.com/ai/open-source-model",
            topic: "technology",
            publishedAt: this.today,
        },
        {
            headline: "WebAssembly runtime now supports GPU compute",
            summary: "WASI GPU API unlocks near-native GPU acceleration in web browsers.",
            source: "The New Stack",
            url: "https://thenewstack.io/webassembly-gpu",
            topic: "technology",
            publishedAt: this.today,
        },
        {
            headline: "Apple releases critical security update for iOS",
            summary: "iOS 18.1 patches three zero-day vulnerabilities affecting all devices.",
            source: "TechCrunch",
            url: "https://techcrunch.com/ios-security-update",
            topic: "technology",
            publishedAt: this.today,
        },
        {
            headline: "Quantum computer achieves new error correction milestone",
            summary: "Scientists demonstrate fault-tolerant qubit operations at record scale.",
            source: "MIT Technology Review",
            url: "https://techreview.com/quantum-error-correction",
            topic: "technology",
            publishedAt: this.today,
        },*/

        // ----- Sports -----
        /*
        {
            headline: "Local marathon runner breaks 3-hour barrier",
            summary: "Sarah Chen completed the city marathon in 2 hours 58 minutes 45 seconds.",
            source: "Sports Daily",
            url: "https://sportsdaily.com/marathon-record",
            topic: "sports",
            publishedAt: this.today,
        },
        {
            headline: "Championship series goes to game 7 thriller",
            summary: "Lakers edge Celtics 112-108 in overtime to claim the title.",
            source: "ESPN",
            url: "https://espn.com/lakers-celtics-game7",
            topic: "sports",
            publishedAt: this.today,
        },
        {
            headline: "Tennis legend announces retirement after 22 majors",
            summary: "The champion will retire after winning three titles this season.",
            source: "Sports Daily",
            url: "https://sportsdaily.com/tennis-retirement",
            topic: "sports",
            publishedAt: this.today,
        },
        {
            headline: "Soccer team wins international tournament",
            summary: "Host nation defeats Brazil 2-1 in the championship final.",
            source: "Reuters Sports",
            url: "https://reuters.com/soccer-tournament-winner",
            topic: "sports",
            publishedAt: this.today,
        },

        // ----- Politics -----
        {
            headline: "New climate bill passes Senate with bipartisan support",
            summary: "The Climate Action Act allocates $50 billion for renewable infrastructure.",
            source: "Reuters",
            url: "https://reuters.com/climate-bill-passes",
            topic: "politics",
            publishedAt: this.today,
        },
        {
            headline: "Mayor unveils $200M infrastructure investment plan",
            summary: "Five-year program targets roads, bridges, and public transit upgrades.",
            source: "The Washington Post",
            url: "https://washingtonpost.com/infrastructure-plan",
            topic: "politics",
            publishedAt: this.today,
        },
        {
            headline: "Supreme Court to hear major tech regulation case",
            summary: "Justices will review Section 230 protections for social media platforms.",
            source: "Reuters",
            url: "https://reuters.com/supreme-court-tech-case",
            topic: "politics",
            publishedAt: this.today,
        },
        {
            headline: "Senate approves new cybersecurity funding bill",
            summary: "Bill allocates $30 billion for critical infrastructure defense and research.",
            source: "Reuters",
            url: "https://reuters.com/cybersecurity-bill",
            topic: "politics",
            publishedAt: this.today,
        },*/
/*
        // ----- Business -----
        {
            headline: "Stock market hits record high on Fed rate signal",
            summary: "S&P 500 closes at 5,300 as investors welcome pause on rate hikes.",
            source: "Bloomberg",
            url: "https://bloomberg.com/stock-market-record",
            topic: "business",
            publishedAt: this.today,
        },*/
        {
            headline: "AI startup raises $150M in Series C funding",
            summary: "Anthropic secures new investment to accelerate Claude development.",
            source: "TechCrunch",
            url: "https://techcrunch.com/anthropic-funding",
            topic: "business",
            publishedAt: this.today,
        },/*
        {
            headline: "Federal Reserve holds interest rates steady",
            summary: "Central bank maintains rates at 5.25 to 5.50 percent for the quarter.",
            source: "Bloomberg",
            url: "https://bloomberg.com/fed-rates-steady",
            topic: "business",
            publishedAt: this.today,
        },*/
        {
            headline: "Tech giant reports 40% revenue growth in cloud segment",
            summary: "Cloud computing division exceeds analyst expectations for Q3.",
            source: "Bloomberg",
            url: "https://bloomberg.com/cloud-revenue-growth",
            topic: "business",
            publishedAt: this.today,
        },
/*
        // ----- Science -----
        {
            headline: "JWST discovers water vapor on potentially habitable exoplanet",
            summary: "James Webb Space Telescope data reveals promising signs of habitability.",
            source: "Nature",
            url: "https://nature.com/jwst-habitable-exoplanet",
            topic: "science",
            publishedAt: this.today,
        },
        {
            headline: "CRISPR gene therapy shows 80% success in clinical trial",
            summary: "Treatment for inherited blindness achieves dramatic vision improvement.",
            source: "Science Magazine",
            url: "https://science.org/crispr-gene-therapy",
            topic: "science",
            publishedAt: this.today,
        },*/
        {
            headline: "Deep-sea explorers discover new species in Mariana Trench",
            summary: "Scientists identify five previously unknown amphipod species.",
            source: "National Geographic",
            url: "https://natgeo.com/mariana-trench-species",
            topic: "science",
            publishedAt: this.today,
        },/*
        {
            headline: "Fusion reactor achieves net energy gain for 24 hours",
            summary: "Experimental tokamak sustains fusion reaction at record duration.",
            source: "Nature",
            url: "https://nature.com/fusion-energy-record",
            topic: "science",
            publishedAt: this.today,
        },

        // ----- Entertainment -----
        {
            headline: "Blockbuster sequel shatters opening weekend box office",
            summary: "Film grosses $150 million domestically, becoming the year's top opener.",
            source: "Variety",
            url: "https://variety.com/blockbuster-box-office",
            topic: "entertainment",
            publishedAt: this.today,
        },
        {
            headline: "Streaming giant reaches 200M subscriber milestone",
            summary: "Netflix adds 12 million new subscribers in Q3, exceeding projections.",
            source: "The Hollywood Reporter",
            url: "https://hollywoodreporter.com/netflix-subscribers",
            topic: "entertainment",
            publishedAt: this.today,
        },
        {
            headline: "Award-winning director teases mystery sci-fi project",
            summary: "Christopher Nolan's next film set for 2025 release, details scarce.",
            source: "Variety",
            url: "https://variety.com/nolan-sci-fi-project",
            topic: "entertainment",
            publishedAt: this.today,
        },
        {
            headline: "Music festival draws 100K attendees over weekend",
            summary: "Three-day event features 50 artists across five stages.",
            source: "Rolling Stone",
            url: "https://rollingstone.com/music-festival-2026",
            topic: "entertainment",
            publishedAt: this.today,
        },

        // ----- Health -----
        {
            headline: "WHO declares end of global health emergency",
            summary: "COVID-19 pandemic phase officially ends after three years.",
            source: "BBC Health",
            url: "https://bbc.com/health-emergency-end",
            topic: "health",
            publishedAt: this.today,
        },
        {
            headline: "New Alzheimer's drug approved by FDA regulators",
            summary: "Treatment slows cognitive decline by 27 percent in late-stage trials.",
            source: "Reuters Health",
            url: "https://reuters.com/alzheimers-drug-fda",
            topic: "health",
            publishedAt: this.today,
        },
        {
            headline: "Study links Mediterranean diet to 30% longer lifespan",
            summary: "Large-scale study confirms heart-healthy eating extends life expectancy.",
            source: "The Lancet",
            url: "https://thelancet.com/mediterranean-diet-study",
            topic: "health",
            publishedAt: this.today,
        },
        {
            headline: "Breakthrough study finds common supplement boosts immunity",
            summary: "Vitamin D deficiency linked to increased infection rates in clinical trial.",
            source: "BBC Health",
            url: "https://bbc.com/vitamin-d-immunity-study",
            topic: "health",
            publishedAt: this.today,
        },*/
    ];

    /**
     * Fetch news items, optionally filtered by topic.
     * @param topic - Optional topic filter (e.g., "technology").
     * @param limit - Maximum number of items to return (default: 3).
     * @returns Shuffled list of news items, up to `limit` in length.
     */
    async fetchNews(topic?: string, limit: number = MAX_NEWS_ITEMS): Promise<NewsItem[]> {
        /*let items: NewsItem[];

        if (topic && topic.length > 0) {
            const filtered = this.allNews.filter((item) => item.topic === topic);
            items = filtered.length > 0 ? filtered : this.allNews;
        } else {
            items = this.allNews;
        }*/

        //return shuffleArray(items).slice(0, limit);
        return this.allNews;
    }
}
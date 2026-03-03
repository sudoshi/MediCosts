import s from './article.module.css';

export default function HealthcarePriceTransparency() {
  return (
    <div className={s.article}>

      <p className={s.dropcap}>
        On July 1, 2022, something remarkable happened in American healthcare. The
        Transparency in Coverage Rule went into effect, requiring every health insurer
        in the United States to publish machine-readable files containing their
        negotiated rates with every provider. Every price. Every hospital. Every
        procedure. All of it, out in the open. For the first time in the history of
        American medicine, the sticker-shock problem had a regulatory solution:
        consumers could, in theory, comparison-shop for an MRI the same way they'd
        compare flights on Kayak.
      </p>

      <p>The policy was sound. The mandate was clear. And the data, technically, is out there.</p>

      <p>We know, because we went looking for it.</p>

      <p>
        Our team set out to build MediCosts — a free, open tool that aggregates insurer
        pricing data so patients can see what procedures actually cost before they walk in
        the door. We began with a straightforward engineering plan: download the mandated
        files, parse them, load them into a database, and build a search interface on top.
        We estimated it would take a few weeks of focused work.
      </p>

      <p>
        That was months ago. What we've discovered since is that the Transparency in
        Coverage Rule created a legal mandate without technical standards for
        accessibility — and that America's health insurers have exploited that gap with
        a thoroughness that borders on artistry. They've complied with the letter of the
        law while burying its spirit under layers of technical obstruction so dense that
        accessing the data requires the kind of engineering resources no ordinary
        consumer — and few organizations — can muster.
      </p>

      <p>This is the story of what we found.</p>

      <h2>The Mandate and the Promise</h2>

      <p>
        The Transparency in Coverage Rule was a centerpiece of a broader push toward
        healthcare price transparency that spanned both the Trump and Biden
        administrations — a rare case of bipartisan policy continuity. The logic was
        compelling: American healthcare spending exceeds $4 trillion annually, yet
        patients routinely have no idea what they'll pay for a procedure until the bill
        arrives weeks later. Insurers negotiate wildly different rates with different
        providers for identical services. A knee MRI might cost $400 at one facility
        and $2,800 at another, both covered by the same plan. The rule was supposed to
        end that opacity.
      </p>

      <p>
        The mechanism was simple. Insurers would publish Machine Readable Files — MRFs —
        in standardized JSON format, containing their negotiated rates. These files would
        be updated monthly and hosted at publicly accessible URLs. The word
        "machine-readable" was doing important work in that sentence: the data wasn't
        meant for consumers to browse directly but for developers and entrepreneurs to
        build tools that would translate the raw data into something useful. An ecosystem
        of comparison-shopping apps, price-check websites, and cost-estimation tools
        would spring up, driven by the same market forces that gave us Zillow for real
        estate and Google Flights for airfare.
      </p>

      <p>That was the theory. It was a good theory. Here's what it ran into.</p>

      <h2>Into the Maze</h2>

      <p>
        We began with what seemed like a reasonable survey: identify the major insurers,
        find their transparency pages, and start downloading files. We catalogued 29
        insurers across 70 endpoints spanning all 50 states and the District of Columbia.
        We expected variation in file formats and hosting arrangements. What we found was
        something far more systematic.
      </p>

      <div className={s.chartContainer}>
        <div className={s.chartTitle}>Insurer Endpoint Accessibility</div>
        <div className={s.chartSubtitle}>
          Of 70 insurer endpoints researched across all 50 states + DC, classified by
          automated accessibility
        </div>
        <svg viewBox="0 0 600 280" xmlns="http://www.w3.org/2000/svg">
          <rect x="80" y="30"  width="260" height="36" rx="3" fill="#22c55e"/>
          <rect x="80" y="80"  width="442" height="36" rx="3" fill="#f97316"/>
          <rect x="80" y="130" width="156" height="36" rx="3" fill="#ef4444"/>
          <rect x="80" y="180" width="208" height="36" rx="3" fill="#71717a"/>
          <rect x="80" y="230" width="520" height="36" rx="3" fill="#3f3f46"/>
          <text x="75" y="53"  textAnchor="end" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600" fill="#e4e4e7">Easy</text>
          <text x="75" y="103" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600" fill="#e4e4e7">Browser Req'd</text>
          <text x="75" y="153" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600" fill="#e4e4e7">Hard</text>
          <text x="75" y="203" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600" fill="#e4e4e7">Dead</text>
          <text x="75" y="253" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600" fill="#e4e4e7">Unknown</text>
          <text x="347" y="53"  fontFamily="JetBrains Mono, monospace" fontSize="13" fontWeight="500" fill="#fff">10 (14%)</text>
          <text x="530" y="103" fontFamily="JetBrains Mono, monospace" fontSize="13" fontWeight="500" fill="#fff">17 (24%)</text>
          <text x="243" y="153" fontFamily="JetBrains Mono, monospace" fontSize="13" fontWeight="500" fill="#fff">6 (9%)</text>
          <text x="295" y="203" fontFamily="JetBrains Mono, monospace" fontSize="13" fontWeight="500" fill="#fff">8 (11%)</text>
          <text x="440" y="253" fontFamily="JetBrains Mono, monospace" fontSize="13" fontWeight="500" fill="#a1a1aa">29 (41%)</text>
        </svg>
        <div className={s.chartSource}>Source: MediCosts internal audit of insurer MRF endpoints, 2024–2025</div>
      </div>

      <p>
        Of the 70 endpoints we researched, only 10 — fourteen percent — were what we'd
        call "easy": a direct, stable URL pointing to a machine-readable file that could
        be downloaded with a simple HTTP request. No browser automation. No reverse
        engineering. No guessing. Just a URL and a file. That's the baseline behavior
        the regulation was designed to produce, and fewer than one in seven insurers
        achieved it.
      </p>

      <p>
        Another 17 required headless browser automation — meaning the "transparency
        page" was a JavaScript Single Page Application that rendered download links
        dynamically, and the only way to find the actual file URLs was to run a full web
        browser in software, intercept its network traffic, and extract the links
        programmatically. Six more had pages that technically existed but provided no
        way to access data in bulk. Eight were simply dead: URLs that returned 404
        errors, SSL certificate failures, or blank pages. And 29 remained untested —
        not because we'd given up, but because we couldn't even determine where to look.
      </p>

      <p>
        Out of all the insurers we catalogued, only 13 could be crawled without a web
        browser. Let that sink in: a regulation designed to produce{' '}
        <em>machine-readable</em> data resulted in files that the majority of publishers
        made inaccessible to machines.
      </p>

      <h2>The Good (Such as It Is)</h2>

      <p>
        Credit where it's due. A handful of insurers made genuine efforts at
        accessibility — or at least, efforts that a competent engineering team could
        work with.
      </p>

      <p>
        UnitedHealthcare publishes a blob API containing approximately 85,000 index
        files. It's technically accessible, but navigating that volume requires custom
        engineering to traverse, filter, and identify the files relevant to any given
        query. It's the transparency equivalent of answering a Freedom of Information
        Act request by delivering the entire filing cabinet: technically responsive,
        practically overwhelming.
      </p>

      <p>
        Anthem publishes gzipped index files on Amazon S3 — straightforward to access
        but compressed to over 10 gigabytes. Cigna uses dated CloudFront URLs; once you
        reverse-engineer their date pattern, you can automate downloads. These are
        workable arrangements, but notice the recurring theme: every one of them
        requires engineering effort to access, not just a browser and a click.
      </p>

      <p>
        Then there's the Blue Cross Blue Shield system — the largest health insurance
        brand in America, operating as a federation of 35+ independent companies
        covering every state. We tested 85 potential Sapphire MRF Hub subdomains, the
        centralized platform some BCBS affiliates use. Only three resolved. We tested
        53 BCBS affiliate URLs using guessed patterns derived from the few that worked.
        One succeeded. Out of 85+ BCBS affiliates, only three had direct,
        machine-readable JSON index files accessible via simple HTTP requests.
      </p>

      <p>Three out of eighty-five.</p>

      <div className={s.diagramContainer}>
        <div className={s.chartTitle}>The Blue Cross Blue Shield Funnel</div>
        <div className={s.chartSubtitle}>
          Attempting to find accessible machine-readable data across the BCBS federation
        </div>
        <svg viewBox="0 0 560 300" xmlns="http://www.w3.org/2000/svg">
          <polygon points="30,30 530,30 490,100 70,100"   fill="#1e3a5c" stroke="#3b82f6" strokeWidth="1.5"/>
          <polygon points="70,108 490,108 440,178 120,178" fill="#1a4d7a" stroke="#3b82f6" strokeWidth="1.5"/>
          <polygon points="120,186 440,186 400,256 160,256" fill="#155e99" stroke="#3b82f6" strokeWidth="1.5"/>
          <polygon points="250,264 310,264 300,290 260,290" fill="#ef4444" stroke="#dc2626" strokeWidth="1.5"/>
          <text x="280" y="72"  textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="14" fontWeight="700" fill="#e4e4e7">85+ BCBS Affiliates Nationwide</text>
          <text x="280" y="148" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600" fill="#e4e4e7">85 Sapphire Hub Subdomains Tested</text>
          <text x="280" y="164" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fill="#94a3b8">+ 53 affiliate URLs via pattern guessing</text>
          <text x="280" y="228" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600" fill="#e4e4e7">URLs That Resolved</text>
          <text x="280" y="244" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fill="#94a3b8">Handful from Sapphire + 1 affiliate</text>
          <text x="280" y="283" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="700" fill="#fff">3</text>
          <line x1="315" y1="277" x2="420" y2="277" stroke="#ef4444" strokeWidth="1" strokeDasharray="4,3"/>
          <text x="425" y="280" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="600" fill="#ef4444">Direct, parseable JSON files</text>
        </svg>
      </div>

      <h2>The Bad</h2>

      <p>If the "good" examples required engineering effort, the "bad" ones required detective work.</p>

      <p>
        HCSC — the Blue Cross affiliate covering Illinois, Texas, Montana, Oklahoma, and
        New Mexico — publishes its machine-readable files on Azure Blob Storage. Sounds
        fine. Except the files aren't published on the first of each month, as you might
        reasonably expect. They appear around the 24th — approximately, not exactly. And
        each state uses a different filename convention that can only be discovered by
        scraping the individual state-level transparency websites, which are themselves
        JavaScript SPAs that require browser automation to read. To access HCSC data
        programmatically, you need to: run a headless browser for each of five state
        websites, extract the current month's Azure Blob URL from the dynamically
        rendered page, handle the fact that the date in the URL is unpredictable, and
        build state-specific parsers because the naming conventions differ.
      </p>

      <p>
        Blue Cross Blue Shield of North Carolina publishes a single index file — the
        table of contents that tells you where the actual rate data lives. That index
        file is 2.4 gigabytes. Not the rate data itself. The <em>index</em>. The table
        of contents. Downloading and parsing it requires streaming JSON processing and
        significant memory allocation for what is, functionally, a list of URLs.
      </p>

      <p>
        UPMC, one of the largest health systems in Pennsylvania, encodes their JSON
        with doubled double-quotes — writing <code>""value""</code> where the spec
        calls for <code>"value"</code>. Every file they publish is technically
        unparseable by any standard JSON library. To use their data, you first have to
        run it through a custom sanitization step that finds and corrects the encoding
        errors. This isn't a one-time glitch; it's their consistent output format.
      </p>

      <p>
        Centene, a major Medicaid managed-care insurer covering tens of millions of
        low-income Americans, hosts their files on a domain with SSL certificate issues —
        specifically, a <code>TLSV1_UNRECOGNIZED_NAME</code> error that causes standard
        HTTP clients to refuse the connection. To download their legally mandated
        transparency data, you have to rewrite the URL to bypass the certificate problem.
      </p>

      <div className={s.pullquote}>
        A regulation designed to produce machine-readable data resulted in files that
        the majority of publishers made inaccessible to machines.
      </div>

      <h2>The Ugly</h2>

      <p>
        The cases above are technical obstacles — frustrating but surmountable with
        enough engineering time. The "ugly" category is something different. It's where
        the design of the transparency portal itself makes bulk access conceptually
        impossible.
      </p>

      <p>
        The majority of Blue Cross Blue Shield affiliates — we documented this pattern
        in Arkansas, Kansas, Alabama, South Carolina, New Jersey, Iowa, New York,
        Tennessee, Massachusetts, and others — hide their data behind EIN-search
        portals. EIN stands for Employer Identification Number: the nine-digit tax ID
        assigned to businesses. To access <em>any</em> pricing data on these portals,
        you must first enter a specific employer's EIN. No EIN, no data. There is no
        browse function. There is no bulk download. There is no way to see what a given
        procedure costs without already knowing which employer's plan you want to query.
      </p>

      <p>
        Think about what this means. The regulation was designed so consumers could
        comparison-shop. These portals require you to already know your employer's tax
        identification number — information most employees don't have — and even then,
        they only show you prices for your specific plan. You can't compare across plans.
        You can't compare across insurers. You can't see what the hospital down the
        street charges versus the one across town. The portal is technically
        "compliant" — the data is "published" in a "machine-readable" format — while
        being effectively useless for any purpose the regulation intended.
      </p>

      <table className={s.dataTable}>
        <thead>
          <tr>
            <th>Obstacle Type</th>
            <th>Example Insurers</th>
            <th>Engineering Required</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>EIN-gated search portals</td>
            <td>BCBS AR, KS, AL, SC, NJ, IA, NY, TN, MA</td>
            <td>Conceptually blocked — no bulk access possible</td>
          </tr>
          <tr>
            <td>JavaScript SPA rendering</td>
            <td>Highmark, multiple BCBS affiliates</td>
            <td>Playwright automation + network interception</td>
          </tr>
          <tr>
            <td>Expiring signed URLs</td>
            <td>Highmark, Aetna (CloudFront)</td>
            <td>Fresh browser sessions for each download</td>
          </tr>
          <tr>
            <td>Malformed data formats</td>
            <td>UPMC (doubled double-quotes)</td>
            <td>Custom JSON sanitization pipeline</td>
          </tr>
          <tr>
            <td>SSL / TLS failures</td>
            <td>Centene</td>
            <td>URL rewriting, certificate bypass</td>
          </tr>
          <tr>
            <td>Unpredictable publish dates</td>
            <td>HCSC (≈24th of month, varies)</td>
            <td>Date-pattern resolvers per insurer</td>
          </tr>
          <tr>
            <td>Gigabyte-scale index files</td>
            <td>BCBS NC (2.4 GB index), Anthem (10+ GB)</td>
            <td>Streaming parsers, significant infrastructure</td>
          </tr>
          <tr>
            <td>Dead URLs / 404s</td>
            <td>Multiple smaller insurers</td>
            <td>No workaround — data simply unavailable</td>
          </tr>
        </tbody>
      </table>

      <p>
        This is compliance theater. The portals satisfy the regulatory checkbox —
        "Are your negotiated rates published in a machine-readable format? Yes." — while
        ensuring that no one outside the insurer's own systems can meaningfully use the
        data. It's the digital equivalent of publishing a book by printing each page on
        a separate grain of rice and storing them in different warehouses.
      </p>

      <h2>The Engineering Tax</h2>

      <p>
        To access data that insurers are legally <em>required</em> to make available,
        our team had to build the following systems from scratch: SSL certificate
        workaround handlers for insurers with broken TLS configurations; a
        malformed-JSON sanitizer that detects and corrects encoding errors across
        multiple vendor-specific corruption patterns; six separate URL date-pattern
        resolvers, because six different insurers use six different conventions for
        embedding dates in their file paths; an Azure Blob Storage enumerator for
        traversing HCSC's unpredictable directory structures; an S3 gzip streaming
        pipeline for handling Anthem's multi-gigabyte compressed archives; a
        Playwright-based browser automation framework with network request interception,
        capable of navigating JavaScript SPAs, waiting for dynamic content to render,
        and extracting download URLs from intercepted API calls; and a dedicated
        PostgreSQL knowledge base just to track which insurers' data we could actually
        reach, what format it was in, when it was last updated, and what custom code
        was required to access it.
      </p>

      <div className={s.chartContainer}>
        <div className={s.chartTitle}>Custom Engineering Required per Insurer Class</div>
        <div className={s.chartSubtitle}>
          Number of distinct custom systems needed to access data, by insurer accessibility rating
        </div>
        <svg viewBox="0 0 520 240" xmlns="http://www.w3.org/2000/svg">
          <line x1="60" y1="200" x2="500" y2="200" stroke="#2a2a2d" strokeWidth="1"/>
          <line x1="60" y1="40"  x2="500" y2="40"  stroke="#1e1e21" strokeWidth="0.5"/>
          <line x1="60" y1="80"  x2="500" y2="80"  stroke="#1e1e21" strokeWidth="0.5"/>
          <line x1="60" y1="120" x2="500" y2="120" stroke="#1e1e21" strokeWidth="0.5"/>
          <line x1="60" y1="160" x2="500" y2="160" stroke="#1e1e21" strokeWidth="0.5"/>
          <text x="55" y="204" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="10" fill="#71717a">0</text>
          <text x="55" y="164" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="10" fill="#71717a">1</text>
          <text x="55" y="124" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="10" fill="#71717a">2</text>
          <text x="55" y="84"  textAnchor="end" fontFamily="Inter, sans-serif" fontSize="10" fill="#71717a">3</text>
          <text x="55" y="44"  textAnchor="end" fontFamily="Inter, sans-serif" fontSize="10" fill="#71717a">4+</text>
          <rect x="100" y="160" width="60" height="40"  rx="2" fill="#22c55e"/>
          <rect x="210" y="80"  width="60" height="120" rx="2" fill="#f97316"/>
          <rect x="320" y="40"  width="60" height="160" rx="2" fill="#ef4444"/>
          <rect x="430" y="200" width="60" height="0"   rx="2" fill="#71717a"/>
          <text x="130" y="154" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="12" fontWeight="500" fill="#fff">~1</text>
          <text x="240" y="74"  textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="12" fontWeight="500" fill="#fff">~3</text>
          <text x="350" y="34"  textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="12" fontWeight="500" fill="#ef4444">4+</text>
          <text x="460" y="194" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="12" fontWeight="500" fill="#71717a">N/A</text>
          <text x="130" y="218" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="600" fill="#e4e4e7">Easy</text>
          <text x="240" y="218" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="600" fill="#e4e4e7">Browser</text>
          <text x="350" y="218" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="600" fill="#e4e4e7">Hard</text>
          <text x="460" y="218" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="600" fill="#e4e4e7">Dead</text>
          <text x="15" y="120" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fill="#71717a" transform="rotate(-90, 15, 120)">Custom systems needed</text>
        </svg>
        <div className={s.chartSource}>Source: MediCosts engineering logs</div>
      </div>

      <p>
        Each of these systems represents days to weeks of engineering effort. None of
        them would be necessary if insurers simply published a JSON file at a stable
        URL, as the regulation intended. The combined effect is an access tax — not
        monetary, but technical — that filters out everyone except well-funded
        organizations with dedicated engineering teams. It is, in practice, a paywall
        built out of complexity instead of price.
      </p>

      <h2>The Pattern Is the Point</h2>

      <p>
        It would be generous to attribute all of this to innocent incompetence. Some of
        it surely is — large organizations have fragmented IT departments, and publishing
        a new data feed is never as simple as it sounds. The SSL errors and malformed
        JSON might well be genuine mistakes that no one inside the organization has
        prioritized fixing.
      </p>

      <p>
        But the EIN-gated search portals are not accidents. They are designed systems,
        built on purpose, that happen to make bulk access impossible while maintaining
        the appearance of compliance. The JavaScript SPAs that require browser
        automation to navigate are not the simplest way to host a file for download —
        they're the most <em>complicated</em> way. A static file on an S3 bucket would
        be cheaper, simpler, and more reliable. The choice to wrap it in a
        client-rendered web application is a choice, and it has consequences that are
        easy to predict.
      </p>

      <p>
        When you see one insurer making data hard to access, that's a bug. When you see
        dozens of insurers, independently arriving at different but equally effective
        methods of technical obstruction, that's an emergent industry strategy. Nobody
        had to send a memo. The incentives are aligned: insurers benefit from information
        asymmetry. Consumers who can't compare prices can't exert downward pressure on
        costs. The regulation threatened that asymmetry, and the industry's collective
        immune response has been to neutralize the threat through implementation.
      </p>

      <div className={s.diagramContainer}>
        <div className={s.chartTitle}>What It Takes to Access "Transparent" Price Data</div>
        <div className={s.chartSubtitle}>
          The actual engineering pipeline required to read publicly mandated insurer files
        </div>
        <svg viewBox="0 0 560 380" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker id="arrow"  viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#52525b"/>
            </marker>
            <marker id="arrow2" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-auto">
              <path d="M 10 0 L 0 5 L 10 10 z" fill="#52525b"/>
            </marker>
          </defs>
          {/* Row 1 */}
          <rect x="20"  y="20"  width="150" height="50" rx="6" fill="#1e2535" stroke="#334155" strokeWidth="1"/>
          <text x="95"  y="42"  textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" fill="#e4e4e7">1. Discover URL</text>
          <text x="95"  y="57"  textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">Scrape SPA, guess pattern,</text>
          <text x="95"  y="68"  textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">or enumerate blob storage</text>
          <line x1="170" y1="45" x2="200" y2="45" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arrow)"/>
          <rect x="200" y="20"  width="150" height="50" rx="6" fill="#1e2535" stroke="#334155" strokeWidth="1"/>
          <text x="275" y="42"  textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" fill="#e4e4e7">2. Handle Auth/SSL</text>
          <text x="275" y="57"  textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">Bypass cert errors,</text>
          <text x="275" y="68"  textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">refresh signed URLs</text>
          <line x1="350" y1="45" x2="380" y2="45" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arrow)"/>
          <rect x="380" y="20"  width="160" height="50" rx="6" fill="#1e2535" stroke="#334155" strokeWidth="1"/>
          <text x="460" y="42"  textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" fill="#e4e4e7">3. Download</text>
          <text x="460" y="57"  textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">Stream GBs of gzipped</text>
          <text x="460" y="68"  textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">JSON index files</text>
          {/* Row 2 (reverse) */}
          <line x1="460" y1="70" x2="460" y2="110" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arrow)"/>
          <rect x="380" y="110" width="160" height="50" rx="6" fill="#1e2535" stroke="#334155" strokeWidth="1"/>
          <text x="460" y="132" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" fill="#e4e4e7">4. Sanitize</text>
          <text x="460" y="147" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">Fix malformed JSON,</text>
          <text x="460" y="158" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">doubled quotes, encoding</text>
          <line x1="380" y1="135" x2="350" y2="135" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arrow2)"/>
          <rect x="200" y="110" width="150" height="50" rx="6" fill="#1e2535" stroke="#334155" strokeWidth="1"/>
          <text x="275" y="132" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" fill="#e4e4e7">5. Parse Index</text>
          <text x="275" y="147" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">Navigate 85K files or</text>
          <text x="275" y="158" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">2.4 GB table of contents</text>
          <line x1="200" y1="135" x2="170" y2="135" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arrow2)"/>
          <rect x="20"  y="110" width="150" height="50" rx="6" fill="#1e2535" stroke="#334155" strokeWidth="1"/>
          <text x="95"  y="132" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" fill="#e4e4e7">6. Download Rates</text>
          <text x="95"  y="147" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">Actual price files —</text>
          <text x="95"  y="158" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">terabytes per insurer</text>
          {/* Row 3 */}
          <line x1="95" y1="160" x2="95" y2="200" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arrow)"/>
          <rect x="20"  y="200" width="150" height="50" rx="6" fill="#1e2535" stroke="#334155" strokeWidth="1"/>
          <text x="95"  y="222" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" fill="#e4e4e7">7. Normalize</text>
          <text x="95"  y="237" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">Map to common schema</text>
          <text x="95"  y="248" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">across 29+ insurers</text>
          <line x1="170" y1="225" x2="200" y2="225" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arrow)"/>
          <rect x="200" y="200" width="150" height="50" rx="6" fill="#1e2535" stroke="#334155" strokeWidth="1"/>
          <text x="275" y="222" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" fill="#e4e4e7">8. Load DB</text>
          <text x="275" y="237" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">PostgreSQL with insurer</text>
          <text x="275" y="248" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#8b95aa">knowledge base metadata</text>
          <line x1="350" y1="225" x2="380" y2="225" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arrow)"/>
          <rect x="380" y="200" width="160" height="50" rx="6" fill="#14532d" stroke="#22c55e" strokeWidth="1"/>
          <text x="460" y="222" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="700" fill="#fff">9. Serve to User</text>
          <text x="460" y="237" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#86efac">What should have been</text>
          <text x="460" y="248" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#86efac">step 1 of 2</text>
          {/* Annotation box */}
          <rect x="120" y="296" width="320" height="70" rx="8" fill="rgba(234,179,8,0.08)" stroke="#eab308" strokeWidth="1.5"/>
          <text x="280" y="320" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700" fill="#eab308">In a functional system, this pipeline would be:</text>
          <text x="280" y="340" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="12" fill="#e4e4e7">GET /transparency/rates.json → display to user</text>
          <text x="280" y="355" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fill="#71717a">Two steps. Not nine.</text>
        </svg>
      </div>

      <h2>What Would Actually Fix This</h2>

      <p>
        The Transparency in Coverage Rule got the policy right and the implementation
        wrong. The fix isn't complicated — at least, not conceptually. The regulation
        needs technical teeth.
      </p>

      <p>
        First, mandate a standardized API. Not "publish a file somewhere on your
        website" — a specific RESTful API specification with defined endpoints, query
        parameters, pagination, and response schemas. The government already does this
        successfully with FHIR (Fast Healthcare Interoperability Resources) for clinical
        data exchange. Apply the same principle here.
      </p>

      <p>
        Second, require automated accessibility testing. CMS should run a monthly
        crawler that verifies every insurer's data is downloadable via a simple HTTP
        request, that the JSON is valid, that the SSL certificates work, and that no
        human interaction — clicking, searching, entering an EIN — is required to access
        the full dataset. If the crawler can't reach it, it's not compliant. Period.
      </p>

      <p>
        Third, enforce meaningfully. The current penalty for noncompliance is $100 per
        day per violation — a rounding error for companies that measure revenue in the
        tens of billions. Penalties should scale to revenue, and "compliance" should be
        defined by accessibility, not merely publication.
      </p>

      <p>
        Fourth, publish a centralized registry. Every insurer's MRF URL should be
        registered with CMS in a single, machine-readable directory. No one should have
        to guess URLs, enumerate subdomains, or scrape state-specific websites to find
        data that the federal government has mandated to be public.
      </p>

      <p>
        None of this is exotic technology. All of it is routine in other industries.
        Flight prices, real estate listings, stock market data, weather forecasts — all
        of these are accessible via standardized, well-documented APIs that any developer
        can use. Healthcare pricing remains the exception because the regulation didn't
        specify <em>how</em> the data must be published, only <em>that</em> it must be.
      </p>

      <h2>Where This Leaves Us</h2>

      <p>
        We're still building MediCosts. We've gotten remarkably far — further, we
        suspect, than most teams would get without this specific combination of
        healthcare domain knowledge and infrastructure engineering. We can now access
        pricing data from a meaningful subset of American insurers, and the number grows
        as we reverse-engineer each new portal, workaround, and data format.
      </p>

      <p>
        But we're also acutely aware that the need for our project is itself an
        indictment. The entire point of the Transparency in Coverage Rule was that teams
        like ours <em>shouldn't need to exist</em>. The data should be straightforward
        enough that a motivated developer could build a comparison tool in a weekend,
        that a patient could look up a price in a minute, that the market forces of an
        informed consumer base would begin, slowly, to bend the cost curve of American
        healthcare.
      </p>

      <p>
        Instead, we have a $4 trillion industry that has turned regulatory compliance
        into an obstacle course — and a regulatory framework that, three years into
        implementation, still lacks the technical standards to prevent it. The prices
        are technically public. They are practically hidden. And the distance between
        those two things is where American healthcare's dysfunction lives.
      </p>

      <div className={s.pullquote}>
        The prices are technically public. They are practically hidden. And the distance
        between those two things is where American healthcare's dysfunction lives.
      </div>

      <p>
        The Transparency in Coverage Rule was the right idea. It remains the right idea.
        But an idea without implementation is just a press release. And right now,
        healthcare price transparency in America is a press release with a 2.4-gigabyte
        attachment, published at an unpredictable URL, behind a JavaScript wall, with a
        broken SSL certificate, requiring an Employer Identification Number you don't
        have, in a JSON file that won't parse.
      </p>

      <p>Good luck comparison-shopping with that.</p>

    </div>
  );
}

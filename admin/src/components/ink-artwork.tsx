export function InkArtwork() {
    return (
        <svg
            className="ink-artwork"
            viewBox="0 0 420 420"
            preserveAspectRatio="xMidYMid slice"
            role="img"
            aria-label="水墨远山示意"
        >
            <circle cx="296" cy="104" r="50" fill="var(--ink)" fillOpacity="0.06" />

            <path
                d="M0 238 L62 192 L116 228 L174 164 L236 222 L298 182 L354 220 L420 186 L420 420 L0 420 Z"
                fill="var(--ink)"
                fillOpacity="0.09"
            />
            <rect x="0" y="236" width="420" height="30" fill="var(--paper)" fillOpacity="0.6" />

            <path
                d="M0 286 L70 246 L130 284 L194 234 L256 282 L316 248 L376 286 L420 264 L420 420 L0 420 Z"
                fill="var(--ink)"
                fillOpacity="0.15"
            />
            <rect x="0" y="284" width="420" height="26" fill="var(--paper)" fillOpacity="0.5" />

            <path
                d="M0 330 L56 302 L122 336 L188 298 L250 334 L312 304 L372 338 L420 316 L420 420 L0 420 Z"
                fill="var(--ink)"
                fillOpacity="0.23"
            />

            <g stroke="var(--ink)" strokeOpacity="0.14" strokeWidth="1" strokeLinecap="round">
                <line x1="86" y1="362" x2="86" y2="392" />
                <line x1="118" y1="370" x2="118" y2="396" />
                <line x1="196" y1="358" x2="196" y2="388" />
                <line x1="228" y1="368" x2="228" y2="394" />
                <line x1="306" y1="360" x2="306" y2="390" />
                <line x1="338" y1="370" x2="338" y2="396" />
            </g>
        </svg>
    );
}

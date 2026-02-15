import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';
const OUTPUT_DIR = path.join(__dirname, '../data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'airports.json');

async function downloadAndProcess() {
    console.log('📡 Fetching airport data from OpenFlights...');

    try {
        const response = await fetch(URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();

        console.log('📄 Processing CSV data...');
        const lines = text.split('\n');
        const airports = [];

        lines.forEach(line => {
            // airports.dat is a CSV with complex quoting
            // Format: ID, Name, City, Country, IATA, ICAO, Lat, Long, Alt, TZ, DST, TzName, Type, Source
            // We use a regex to handle quoted fields correctly
            const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);

            if (parts && parts.length >= 5) {
                const iata = parts[4].replace(/"/g, '');
                const name = parts[1].replace(/"/g, '');
                const city = parts[2].replace(/"/g, '');

                // Only keep rows with valid 3-letter IATA codes
                if (iata && iata.length === 3 && iata !== '\\N') {
                    airports.push({
                        iata: iata,
                        name: name,
                        city: city
                    });
                }
            }
        });

        console.log(`✅ Processed ${airports.length} valid airports.`);

        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(airports));
        console.log(`💾 Saved to ${OUTPUT_FILE}`);

    } catch (error) {
        console.error('❌ Failed to process airports:', error);
        process.exit(1);
    }
}

downloadAndProcess();

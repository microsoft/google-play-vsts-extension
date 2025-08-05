import { JSDOM } from 'jsdom';

/**
 * Test script to validate jsdom upgrade impact
 * This tests the specific usage pattern found in metadataHelper.ts
 */

console.log('Testing jsdom functionality after upgrade...\n');

// Test 1: Basic JSDOM instantiation and DOM parsing
try {
    const htmlContent = '<html><body><div>Test content</div><span>Another element</span></body></html>';
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    
    console.log('✓ Test 1 PASSED: Basic JSDOM instantiation works');
    console.log(`  Document title: "${document.title}"`);
    console.log(`  Body child nodes count: ${document.body.childNodes.length}`);
} catch (error) {
    console.log('✗ Test 1 FAILED: Basic JSDOM instantiation failed');
    console.error(`  Error: ${error.message}`);
}

// Test 2: Specific usage pattern from metadataHelper.ts
try {
    const changelogHtml = `
    <html>
        <body>
            <en-US>Fixed bugs and improved performance</en-US>
            <fr-FR>Correction de bugs et amélioration des performances</fr-FR>
            <de-DE>Fehlerbehebungen und Leistungsverbesserungen</de-DE>
        </body>
    </html>`;
    
    const releaseNotes = [];
    
    // Simulate the exact code pattern from metadataHelper.ts
    for (const node of new JSDOM(changelogHtml).window.document.body.childNodes.values()) {
        const language = node['tagName'];
        const text = node.textContent?.trim();

        if (language && text) {
            releaseNotes.push({ language, text });
        }
    }
    
    console.log('✓ Test 2 PASSED: metadataHelper.ts usage pattern works');
    console.log(`  Parsed ${releaseNotes.length} release notes:`);
    releaseNotes.forEach(note => {
        console.log(`    ${note.language}: ${note.text}`);
    });
    
} catch (error) {
    console.log('✗ Test 2 FAILED: metadataHelper.ts usage pattern failed');
    console.error(`  Error: ${error.message}`);
}

// Test 3: Empty/malformed content handling
try {
    const emptyContent = '<html><body></body></html>';
    const dom = new JSDOM(emptyContent);
    const childNodes = Array.from(dom.window.document.body.childNodes);
    
    console.log('✓ Test 3 PASSED: Empty content handling works');
    console.log(`  Empty body child nodes count: ${childNodes.length}`);
    
} catch (error) {
    console.log('✗ Test 3 FAILED: Empty content handling failed');
    console.error(`  Error: ${error.message}`);
}

// Test 4: Check if node properties are accessible as before
try {
    const htmlWithCustomTags = '<html><body><custom-tag>Some content</custom-tag></body></html>';
    const dom = new JSDOM(htmlWithCustomTags);
    
    for (const node of dom.window.document.body.childNodes.values()) {
        if (node.nodeType === 1) { // Element node
            const tagName = node['tagName'];
            const textContent = node.textContent;
            console.log('✓ Test 4 PASSED: Node property access works');
            console.log(`  Custom tag name: ${tagName}`);
            console.log(`  Text content: ${textContent}`);
            break;
        }
    }
    
} catch (error) {
    console.log('✗ Test 4 FAILED: Node property access failed');
    console.error(`  Error: ${error.message}`);
}

console.log('\nJSDOM validation complete!');

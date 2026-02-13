#!/usr/bin/env node

/**
 * Test script for TTS text preprocessing
 * This demonstrates how text is cleaned before being sent to TTS
 */

function preprocessTextForTTS(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }
    
    let cleanedText = text;
    
    // Remove URLs (http, https, www)
    cleanedText = cleanedText.replace(/https?:\/\/[^\s]+/g, '');
    cleanedText = cleanedText.replace(/www\.[^\s]+/g, '');
    
    // Remove markdown code blocks and inline code
    cleanedText = cleanedText.replace(/```[\s\S]*?```/g, '');
    cleanedText = cleanedText.replace(/`[^`]+`/g, '');
    
    // Remove markdown bold, italic, strikethrough
    cleanedText = cleanedText.replace(/\*\*(.*?)\*\*/g, '$1');
    cleanedText = cleanedText.replace(/\*(.*?)\*/g, '$1');
    cleanedText = cleanedText.replace(/__(.*?)__/g, '$1');
    cleanedText = cleanedText.replace(/_(.*?)_/g, '$1');
    cleanedText = cleanedText.replace(/~~(.*?)~~/g, '$1');
    
    // Remove reference citations
    cleanedText = cleanedText.replace(/\[\d+\]/g, '');
    cleanedText = cleanedText.replace(/\[[^\]]+\]/g, '');
    
    // Remove markdown headers
    cleanedText = cleanedText.replace(/^#{1,6}\s+/gm, '');
    
    // Remove markdown list markers
    cleanedText = cleanedText.replace(/^\s*[-*+]\s+/gm, '');
    cleanedText = cleanedText.replace(/^\s*\d+\.\s+/gm, '');
    
    // Remove special symbols
    cleanedText = cleanedText.replace(/[#@$%^&*_+=<>{}[\]\\|`~]/g, '');
    
    // Remove emojis (preserve Devanagari)
    cleanedText = cleanedText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '');
    
    // Clean up whitespace
    cleanedText = cleanedText.replace(/\s+/g, ' ');
    cleanedText = cleanedText.replace(/\n\s*\n/g, '\n');
    cleanedText = cleanedText.trim();

    // Clean up References
    cleanedText = cleanedText.replace("References:", ' ');
    
    return cleanedText;
}

// Test cases
const testCases = [
    {
        name: "Text with URLs",
        input: "Check out https://example.com for more info. Visit www.google.com",
        expected: "Check out for more info. Visit"
    },
    {
        name: "Markdown formatting",
        input: "This is **bold** and *italic* text with ~~strikethrough~~",
        expected: "This is bold and italic text with strikethrough"
    },
    {
        name: "Reference citations",
        input: "According to the study[1], we found that results[2] were significant[source]",
        expected: "According to the study, we found that results were significant"
    },
    {
        name: "Code blocks",
        input: "Here's some code: ```python\nprint('hello')``` and inline `code`",
        expected: "Here's some code: and inline"
    },
    {
        name: "Headers and lists",
        input: "## Header\n- Item 1\n- Item 2\n1. First\n2. Second",
        expected: "Header Item 1 Item 2 First Second"
    },
    {
        name: "Special characters",
        input: "Price is $100 @ 50% off! #sale *limited* time",
        expected: "Price is 100 50 off! sale limited time"
    },
    {
        name: "Hindi text with references",
        input: "यह एक **परीक्षण** है[1] और यह https://example.com लिंक है",
        expected: "यह एक परीक्षण है और यह लिंक है"
    },
    {
        name: "Mixed content",
        input: "**Important:** Visit https://docs.example.com [source] for details.\n- Point 1\n- Point 2",
        expected: "Important: Visit for details. Point 1 Point 2"
    },
    {
        name: "Emojis",
        input: "Hello 👋 world 🌍! This is great 🎉",
        expected: "Hello world ! This is great"
    },
    {
        name: "Complex markdown",
        input: "# Title\n\n**Bold text** with [link](url) and `code`.\n\n- Item 1\n- Item 2\n\n```\ncode block\n```",
        expected: "Title Bold text with and . Item 1 Item 2"
    }
];

console.log('='.repeat(70));
console.log('           TTS Text Preprocessing Test');
console.log('='.repeat(70));
console.log();

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
    const result = preprocessTextForTTS(test.input);
    const success = result === test.expected;
    
    if (success) {
        passed++;
        console.log(`✓ Test ${index + 1}: ${test.name}`);
    } else {
        failed++;
        console.log(`✗ Test ${index + 1}: ${test.name}`);
        console.log(`  Input:    "${test.input}"`);
        console.log(`  Expected: "${test.expected}"`);
        console.log(`  Got:      "${result}"`);
    }
    console.log();
});

console.log('='.repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(70));
console.log();

// Interactive test
if (process.argv.length > 2) {
    const customText = process.argv.slice(2).join(' ');
    console.log('Custom Input:');
    console.log(customText);
    console.log();
    console.log('Cleaned Output:');
    console.log(preprocessTextForTTS(customText));
    console.log();
}

// Example usage
console.log('Example Usage:');
console.log('-'.repeat(70));

const exampleInput = `
Here are the **top 3 tips**[1]:

1. Visit https://example.com for more info
2. Use \`npm install\` to setup
3. Check [documentation] for details

**Note:** This is _important_! 🎉
`;

console.log('Input:');
console.log(exampleInput);
console.log();
console.log('Cleaned for TTS:');
console.log(preprocessTextForTTS(exampleInput));
console.log();
console.log('='.repeat(70));
console.log();
console.log('Usage: node test_preprocessing.js "Your custom text here"');
console.log();

process.exit(failed > 0 ? 1 : 0);
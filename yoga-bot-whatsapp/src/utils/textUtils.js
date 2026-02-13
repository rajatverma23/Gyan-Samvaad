function processMarkdown(text) {
    // Replace markdown code blocks with WhatsApp monospace
    text = text.replace(/```(.*?)```/gs, '```$1```');
    
    // Replace markdown inline code with WhatsApp monospace
    text = text.replace(/`([^`]+)`/g, '```$1```');
    
    // Replace markdown bold with WhatsApp bold
    text = text.replace(/\*\*(.*?)\*\*/g, '*$1*');
    
    // Replace markdown italic with WhatsApp italic
    text = text.replace(/_(.*?)_/g, '_$1_');
    
    // Replace markdown strikethrough with WhatsApp strikethrough
    text = text.replace(/~~(.*?)~~/g, '~$1~');
    
    // Replace markdown unordered lists with WhatsApp lists (with proper spacing)
    text = text.replace(/^\s*[-*]\s+(.*)$/gm, '\n• $1\n');
    
    // Replace markdown numbered lists (with proper spacing)
    text = text.replace(/^\s*(\d+)\.\s+(.*)$/gm, '\n$1. $2\n');

    // Handle Devanagari script better (for Hindi)
    text = text.replace(/([।॥])/g, '$1\n');

    // Ensure URLs are properly spaced for clickable links
    text = text.replace(
        /(https?:\/\/[^\s]+)/g, 
        '\n$1\n'
    );
    
    // Clean up any multiple newlines
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    // Ensure list items are properly spaced
    text = text.replace(/(•|\d+\.)\s+(.*?)(\n|$)/g, '$1 $2\n');
    
    // Remove any leading/trailing whitespace
    text = text.trim();
    
    return text;
}

function extractProductInfo(text, language) {
    // Define patterns for both languages
    const patterns = {
        'eng': {
            name: /\*\*(.*?)\*\*/,
            price: /Price:\s*₹?(\d+)/,
            link: /\[Product Link\]\((.*?)\)/,
            thumbnail: /!\[Thumbnail\]\((.*?)\)/
        },
        'hin': {
            name: /\*\*(.*?)\*\*/,
            price: /कीमत:\s*₹?(\d+)/,
            link: /\[उत्पाद लिंक\]\((.*?)\)/,
            thumbnail: /!\[थंबनेल\]\((.*?)\)/
        }
    };

    // Get the appropriate pattern based on language
    const pattern = patterns[language] || patterns['eng'];
    
    // Create a combined regex that matches the entire product block
    const productRegex = new RegExp(
        `${pattern.name.source}\\n\\s*-\\s*${pattern.price.source}\\n\\s*-\\s*${pattern.link.source}\\n\\s*-\\s*${pattern.thumbnail.source}`,
        'g'
    );

    const products = [];
    let match;
    let lastIndex = 0;
    
    while ((match = productRegex.exec(text)) !== null) {
        products.push({
            name: match[1],
            price: match[2],
            link: match[3],
            imageUrl: match[4]
        });
        lastIndex = match.index + match[0].length;
    }

    // Extract the remaining text after the last product
    const remainingText = text.slice(lastIndex).trim();
    
    return {
        products,
        remainingText
    };
}

module.exports = {
    processMarkdown,
    extractProductInfo
}; 
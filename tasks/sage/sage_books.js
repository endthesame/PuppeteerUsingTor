module.exports = function extractMetadata() {
    // Ваш код для извлечения метаданных здесь
    // Верните результат в виде словаря
    let getMetaAttribute = (selector, attribute, childSelector) => {
        const element = document.querySelector(selector);
        if (element) {
            const targetElement = childSelector ? element.querySelector(childSelector) : element;
            return targetElement.getAttribute(attribute) || "";
        }
        return "";
    };
    
    let getMetaAttributes = (selectors, attribute, childSelector) => {
        let values = [];
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                values = Array.from(elements).map(element => {
                    const targetElement = childSelector ? element.querySelector(childSelector) : element;
                    return targetElement.getAttribute(attribute);
                });
                break; // Прерываем цикл после первого успешного поиска
            }
        }
        // if (values.length === 0) {
        //     return "";
        // }
        return values.join('; ');
    };

    function getTextFromElementWithoutSpan(elem) {
        let text = '';
        elem.childNodes?.forEach(node => {
            if (node.nodeName !== 'SPAN') {
                text += node.textContent;
            }
        });
        return text.trim();
    }

    function romanToNumberOrReturn(input) {
        const romanNumerals = {
            'I': 1,
            'V': 5,
            'X': 10,
            'L': 50,
            'C': 100,
            'D': 500,
            'M': 1000,
            'i': 1,
            'v': 5,
            'x': 10,
            'l': 50,
            'c': 100,
            'd': 500,
            'm': 1000

        };
    
        // Проверка, является ли входное значение римской цифрой
        function isRoman(input) {
            return /^[IVXLCDMivxlcdm]+$/i.test(input);
        }
    
        // Если входное значение не является римской цифрой, возвращаем его без изменений
        if (!isRoman(input)) {
            return input;
        }
    
        let result = 0;
        let prevValue = 0;
    
        // Преобразование римской цифры в число
        for (let i = input.length - 1; i >= 0; i--) {
            let currentValue = romanNumerals[input[i]];
    
            if (currentValue < prevValue) {
                result -= currentValue;
            } else {
                result += currentValue;
            }
    
            prevValue = currentValue;
        }
    
        // Преобразование числа в строку и возвращение результата
        return result.toString();
    }

    let date = getMetaAttribute(['meta[name="citation_publication_date"]'], 'content').match(/\d{4}/)?.[0] || '';
    if (date === "") {
        let rawArrDate = Array.from(document.querySelectorAll('.book-info-list li')).map(elem => elem.innerText.trim()).filter(elem => elem.includes("Publication year:"))
        if (rawArrDate.length > 0){
            date = rawArrDate[0].match(/Publication year: (\d{4})/) ? rawArrDate[0].match(/Publication year: (\d{4})/)[1] : "";
        }
    }
    if (date.length == 4) {
        date = `${date}-01-01`;
    }

    let rawAuthors = Array.from(document.querySelectorAll('meta[name="citation_author"]')).map(author => author.content.trim())
    let authors = [... new Set(rawAuthors)].join('; ')
    if (authors == ""){
        rawAuthors = Array.from(document.querySelectorAll('.book-metadata-author')).map(author => author.innerText.trim())
        authors = [... new Set(rawAuthors)].join('; ')
    }

    let mf_doi = getMetaAttribute(['meta[name="citation_doi"]'], 'content')
    if (mf_doi == ""){
        let doiArr = Array.from(document.querySelectorAll('.book-info-list li')).filter(elem => elem.innerText.includes("DOI:")).map(elem => elem.innerText.trim()? elem.innerText.trim().match(/doi.org\/(10.*)/)? elem.innerText.trim().match(/doi.org\/(10.*)/)[1] : "" : "" );
        if (doiArr.length > 0){
            mf_doi = doiArr[0];
        }
    }

    let lang = getMetaAttribute(['meta[name="citation_language"]'], 'content')
    if (lang === 'en'){
        lang = 'eng';
    }

    let publisher = getMetaAttribute(['meta[name="citation_publisher"]'], 'content')
    if (publisher == ""){
        let publisherArr = Array.from(document.querySelectorAll('.book-info-list li')).filter(elem => elem.innerText.includes("Publisher:")).map(elem => elem.innerText.replace("Publisher:", "").trim());
        if (publisherArr.length > 0){
            publisher = publisherArr[0];
        }
    }

    let mf_book = getMetaAttribute(['meta[name="citation_title"]'], 'content')
    if (mf_book == ""){
        mf_book = document.querySelector('.book-info-holder .text-holder h1')? document.querySelector('.book-info-holder .text-holder h1').innerText.trim() : "";
    }

    // let volume = getMetaAttribute(['meta[name="citation_volume"]'], 'content')
    // let volumeArr = Array.from(document.querySelectorAll('.si-component')).filter(block => block.innerText.toLowerCase().includes("volume")).map(elem => elem.innerText.toLowerCase().match(/volume (\d+)/)? elem.innerText.toLowerCase().match(/volume (\d+)/)[1] : "");
    // if (volumeArr.length > 0){
    //     volume = volumeArr[0];
    // }
    // if (volume == "" && Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("citation")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)[1] : "" : "")){
    //     volume = Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("citation")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)[1] : "" : "")[0] || "";
    // }

    let edition = "";
    if (edition == ""){
        let editionArr = Array.from(document.querySelectorAll('.book-info-list li')).filter(elem => elem.innerText.includes("Edition:")).map(elem => elem.innerText.replace("Edition:", "").trim());
        if (editionArr.length > 0){
            edition = editionArr[0];
        }
    }

    let book_series = "";
    if (book_series == ""){
        let book_seriesArr = Array.from(document.querySelectorAll('.book-info-list li')).filter(elem => elem.innerText.includes("Series:")).map(elem => elem.innerText.replace("Series:", "").trim());
        if (book_seriesArr.length > 0){
            book_series = book_seriesArr[0];
        }
    }

    let isbn = "";
    if (isbn == ""){
        let isbnArr = Array.from(document.querySelectorAll('.book-info-list li')).filter(elem => elem.innerText.includes("Print ISBN:")).map(elem => elem.innerText.match(/Print ISBN:([0-9-]+)/)? elem.innerText.match(/Print ISBN:([0-9-]+)/)[1] : "");
        if (isbnArr.length > 0){
            isbn = isbnArr[0];
        }
    }
    let eisbn = "";
    if (eisbn == ""){
        let eisbnArr = Array.from(document.querySelectorAll('.book-info-list li')).filter(elem => elem.innerText.includes("Online ISBN:")).map(elem => elem.innerText.match(/Online ISBN:([0-9-]+)/)? elem.innerText.match(/Online ISBN:([0-9-]+)/)[1] : "");
        if (eisbnArr.length > 0){
            eisbn = eisbnArr[0];
        }
    }

    if (isbn == "" && eisbn == ""){
        isbn = getMetaAttribute(['meta[name="citation_isbn"]'], 'content') || '';
    }

    let abstract = document.querySelector('.books-holder #tabstrip-1 p')? document.querySelector('.books-holder #tabstrip-1 p').innerText.trim() : "";
    if (abstract == ""){
        abstract = document.querySelector('[type="application/ld+json"]')? document.querySelector('[type="application/ld+json"]').innerText.match(/"description":"(.*)","image/)? document.querySelector('[type="application/ld+json"]').innerText.match(/"description":"(.*)","image/)[1].replaceAll("'", "") : "" : "";
    }
    
    let rawKeywords = Array.from(document.querySelectorAll('[name="citation_keywords"]')).map(elem => elem.content)
    let keywords = [... new Set(rawKeywords)].join(';')
    if (keywords == ""){
        rawKeywords = Array.from(document.querySelectorAll('.keyword-text-holder a')).map(elem => elem.innerText.trim());
        keywords = [... new Set(rawKeywords)].join(';')
    }

    var metadata = { '200': authors, '203': date, '233':mf_doi, '235': publisher, '242': mf_book, '205': lang, '81': abstract, '201': keywords, '199': edition, '243': book_series, '240': isbn, '241': eisbn};
    if (!metadata["242"])
    {
        metadata = false
    }
    return metadata;
};
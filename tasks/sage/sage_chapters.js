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

    let title = document.querySelector('.chapter-info > h1')? document.querySelector('.chapter-info > h1').innerText.trim() : "";

    let date = getMetaAttribute(['meta[name="citation_publication_date"]'], 'content').match(/\d{4}/)?.[0] || '';
    // if (date === "") {
    //     let rawArrDate = Array.from(document.querySelectorAll('.book-info-list li')).map(elem => elem.innerText.trim()).filter(elem => elem.includes("Publication year:"))
    //     if (rawArrDate.length > 0){
    //         date = rawArrDate[0].match(/Publication year: (\d{4})/) ? rawArrDate[0].match(/Publication year: (\d{4})/)[1] : "";
    //     }
    // }
    if (date.length == 4) {
        date = `${date}-01-01`;
    }

    let authors = Array.from(document.querySelectorAll('.chapter-info ul.meta-list li')).find(item => item.querySelector('strong.title').innerText === 'By:')?.innerText.replace('By:', '').replaceAll('\n', '').replaceAll(', ', '; ').replaceAll(' & ', '; ').trim() || '';
    if (authors == ""){
        let rawAuthors = Array.from(document.querySelectorAll('meta[name="citation_author"]')).map(author => author.content.trim())
        authors = [... new Set(rawAuthors)].join('; ')
    }
    // if (authors == ""){
    //     rawAuthors = Array.from(document.querySelectorAll('meta[name="citation_author"]')).map(author => author.content.trim())
    //     authors = [... new Set(rawAuthors)].join('; ')
    // }

    let mf_doi = getMetaAttribute(['meta[name="citation_doi"]'], 'content')
    if (mf_doi == ""){
        mf_doi = Array.from(document.querySelectorAll('.chapter-info ul.meta-list li')).find(item => item.querySelector('strong.title').innerText === 'Chapter DOI:')?.innerText.replace('Chapter DOI:', '').replace('https://doi.org/','').trim() || '';
    }

    let lang = getMetaAttribute(['meta[name="citation_language"]'], 'content')
    if (lang === 'en'){
        lang = 'eng';
    }

    let publisher = getMetaAttribute(['meta[name="citation_publisher"]'], 'content')
    // if (publisher == ""){
    //     let publisherArr = Array.from(document.querySelectorAll('.book-info-list li')).filter(elem => elem.innerText.includes("Publisher:")).map(elem => elem.innerText.replace("Publisher:", "").trim());
    //     if (publisherArr.length > 0){
    //         publisher = publisherArr[0];
    //     }
    // }

    let mf_book = Array.from(document.querySelectorAll('.chapter-info ul.meta-list li')).find(item => item.querySelector('strong.title').innerText === 'In:')?.innerText.replace('In:', '').trim() || '';
    if (mf_book == ""){
        mf_book = getMetaAttribute(['meta[name="citation_title"]'], 'content')
    }

    // let volume = getMetaAttribute(['meta[name="citation_volume"]'], 'content')
    // let volumeArr = Array.from(document.querySelectorAll('.si-component')).filter(block => block.innerText.toLowerCase().includes("volume")).map(elem => elem.innerText.toLowerCase().match(/volume (\d+)/)? elem.innerText.toLowerCase().match(/volume (\d+)/)[1] : "");
    // if (volumeArr.length > 0){
    //     volume = volumeArr[0];
    // }
    // if (volume == "" && Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("citation")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)[1] : "" : "")){
    //     volume = Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("citation")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)[1] : "" : "")[0] || "";
    // }

    // let edition = "";
    // if (edition == ""){
    //     let editionArr = Array.from(document.querySelectorAll('.book-info-list li')).filter(elem => elem.innerText.includes("Edition:")).map(elem => elem.innerText.replace("Edition:", "").trim());
    //     if (editionArr.length > 0){
    //         edition = editionArr[0];
    //     }
    // }

    // let book_series = "";
    // if (book_series == ""){
    //     let book_seriesArr = Array.from(document.querySelectorAll('.book-info-list li')).filter(elem => elem.innerText.includes("Series:")).map(elem => elem.innerText.replace("Series:", "").trim());
    //     if (book_seriesArr.length > 0){
    //         book_series = book_seriesArr[0];
    //     }
    // }

    let isbn = "";
    let eisbn = "";

    if (isbn == "" && eisbn == ""){
        isbn = getMetaAttribute(['meta[name="citation_isbn"]'], 'content') || '';
    }

    let abstract = document.querySelector('.chapter')? document.querySelector('.chapter').innerText.trim() : "";
    if (abstract == ""){
        abstract = document.querySelector('[type="application/ld+json"]')? document.querySelector('[type="application/ld+json"]').innerText.match(/"description":"(.*)","image/)? document.querySelector('[type="application/ld+json"]').innerText.match(/"description":"(.*)","image/)[1].replaceAll("'", "") : "" : "";
    }
    
    let rawKeywords = Array.from(document.querySelectorAll('[name="citation_keywords"]')).map(elem => elem.content)
    let keywords = [... new Set(rawKeywords)].join(';')
    if (keywords == ""){
        keywords = Array.from(document.querySelectorAll('.chapter-info ul.meta-list li')).find(item => item.querySelector('strong.title').innerText === 'Keywords:')?.innerText.replace('Keywords:', '').trim() || '';
    }

    var metadata = {'202': title, '200': authors, '203': date, '233':mf_doi, '235': publisher, '242': mf_book, '205': lang, '81': abstract, '201': keywords, '240': isbn, '241': eisbn};
    if (!metadata["202"])
    {
        metadata = false
    }
    return metadata;
};
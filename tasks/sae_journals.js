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

    let title = document.querySelector('.si-title ')? document.querySelector('.si-title ').innerText.trim() : "";
    if (title === "") {
        title = getMetaAttribute(['meta[name="citation_title"]'], 'content');
    }
    let date = getMetaAttribute(['meta[name="citation_date"]'], 'content').match(/\d{4}/)?.[0] || '';
    if (date === "") {
        date = document.querySelector('.si-masthead__b__item.si-published')? document.querySelector('.si-masthead__b__item.si-published').innerText.match(/\d{4}/)? document.querySelector('.si-masthead__b__item.si-published').innerText.match(/\d{4}/)[0] : "" : "";
    }
    if (date.length == 4) {
        date = `${date}-01-01`;
    }
    let authors = getMetaAttributes(['meta[name="citation_author"]'], 'content') // ДУБЛИРУЕТСЯ МЕТА - ФИКС НУЖНО СДЕЛАТЬ
    if (authors == ""){
        let rawAuthors = Array.from(document.querySelectorAll('a[data-analytics="item-detail-author-card-author-btn"]')).map(author => author.innerText.trim())
        authors = [... new Set(rawAuthors)].join('; ')
    }
    let doi = getMetaAttribute(['meta[name="citation_doi"]'], 'content')
    let lang = getMetaAttribute(['meta[name="citation_language"]'], 'content')
    if (lang === 'English'){
        lang = 'eng';
    }
    let publisher = getMetaAttribute(['meta[name="citation_publisher"]'], 'content')
    let mf_journal = document.querySelector('#mat-chip-list-1')? document.querySelector('#mat-chip-list-1').innerText.trim() : "";
    let print_issn = "";
    let e_issn = "";
    let rawArr = Array.from(document.querySelectorAll('meta[name="citation_issn"]')).map(elem => elem.content)
    let issns = [... new Set(rawArr)]
    if (issns.length == 2){
        print_issn = issns[0]
        e_issn = issns[1]
    }
    if (issns.length == 1){
        print_issn = issns[0]
    }
    let abstract = document.querySelector('#cdk-accordion-child-1 .si-data .si-data__set.si-wd-full .si-dataout__c')? document.querySelector('#cdk-accordion-child-1 .si-data .si-data__set.si-wd-full .si-dataout__c').innerText.trim() : "";
    let author_aff = Array.from(document.querySelectorAll('.si-authors .mat-card-header-text')).filter(elem => {
        let author = elem.querySelector('a[data-analytics="item-detail-author-card-author-btn"]')? elem.querySelector('a[data-analytics="item-detail-author-card-author-btn"]').innerText : "";
        let aff = elem.querySelector('a[data-analytics="item-detail-author-card-affiliation-btn"]')? elem.querySelector('a[data-analytics="item-detail-author-card-affiliation-btn"]').innerText : "";
        if (author.length > 1 && aff.length > 1){
            return true;
        } else {
            return false;
        }
    }).map(elem => {
        let author = elem.querySelector('a[data-analytics="item-detail-author-card-author-btn"]')? elem.querySelector('a[data-analytics="item-detail-author-card-author-btn"]').innerText : "";
        let aff = elem.querySelector('a[data-analytics="item-detail-author-card-affiliation-btn"]')? elem.querySelector('a[data-analytics="item-detail-author-card-affiliation-btn"]').innerText : "";
        if (author.length > 1 && aff.length > 1){
            return `${author}:${aff}`
        }
    }).join(";; ")
    let rawTopics = Array.from(document.querySelectorAll('[arialabel="Topics"] .ng-star-inserted')).map(elem => elem.innerText)
    let topics = [... new Set(rawTopics)].join(';') 

    var metadata = { '202': title, '200': authors, '233':doi, '235': publisher, '203': date, '232': mf_journal, '184': print_issn, '185': e_issn, '205': lang, '81': abstract, '144': author_aff, '201': topics};
    if (!metadata["202"])
    {
        metadata = false
    }
    return metadata;
};
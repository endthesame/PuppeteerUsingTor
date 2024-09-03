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

    function getOrcids() {
        let orcids = Array.from(document.querySelectorAll('.al-author-name')).map(author => {
            let authorName = author.querySelector('.linked-name')? author.querySelector('.linked-name').innerText : "";
            let orchid = author.querySelector('.info-card-location')? author.querySelector('.info-card-location').innerText.trim() : "";
            if (authorName.length > 2 && orchid.length > 2 && orchid.includes("orcid.org")){
              return `${authorName}::${orchid}`
            }
        }).filter(item => item !== undefined).join(";; ")
        if (orcids == ""){
            orcids = Array.from(document.querySelectorAll('.al-author-name-more')).map(author => {
                let authorName = author.querySelector('.linked-name')? author.querySelector('.linked-name').innerText : "";
                let orchid = author.querySelector('.info-card-location')? author.querySelector('.info-card-location').innerText.trim() : "";
                if (authorName.length > 2 && orchid.length > 2 && orchid.includes("orcid.org")){
                  return `${authorName}::${orchid}`
                }
            }).filter(item => item !== undefined).join(";; ")
        }
        return orcids;
    }

    function getAff() {
        function getAffText(affElement) {
            return Array.from(affElement.children)
                .filter(child => !child.classList.contains('title-label'))
                .map(child => child.innerText.trim())
                .filter(text => text.length > 0)
                .join(', ');
        }
    
        let affs = Array.from(document.querySelectorAll('.al-author-name')).map(author => {
            let authorName = author.querySelector('.linked-name') ? author.querySelector('.linked-name').innerText : "";
            let affElement = author.querySelector('.aff');
            let aff = affElement ? getAffText(affElement) : "";
    
            if (authorName.length > 2 && aff.length > 2) {
                return `${authorName} : ${aff}`;
            }
        }).filter(item => item !== undefined).join(";; ");
    
        if (affs == "") {
            affs = Array.from(document.querySelectorAll('.al-author-name-more')).map(author => {
                let authorName = author.querySelector('.linked-name') ? author.querySelector('.linked-name').innerText : "";
                let affElement = author.querySelector('.aff');
                let aff = affElement ? getAffText(affElement) : "";
    
                if (authorName.length > 2 && aff.length > 2) {
                    return `${authorName} : ${aff}`;
                }
            }).filter(item => item !== undefined).join(";; ");
        }
    
        return affs;
    }

    function extractAuthorsAndInstitutions() {
        const authors = Array.from(document.querySelectorAll('meta[name="citation_author"]'));
        const institutions = Array.from(document.querySelectorAll('meta[name="citation_author_institution"]'));
      
        const result = [];
      
        for (const author of authors) {
            const authorName = author.getAttribute('content');
            const authorInstitutions = [];
        
            // сопоставление авторов и аффиляции
            let nextSibling = author.nextElementSibling;
            while (nextSibling && nextSibling.tagName === 'META' && nextSibling.getAttribute('name') === 'citation_author_institution') {
            authorInstitutions.push(nextSibling.getAttribute('content'));
            nextSibling = nextSibling.nextElementSibling;
            }
            if (authorInstitutions.length != 0) {
                result.push(`${authorName} : ${authorInstitutions.join('!')}`);
            }
        }
      
        return result.join(";; ");
      }
      
    let affiliation = getAff();
    if (affiliation == ""){
        affiliation = extractAuthorsAndInstitutions();
    }

    let title = getMetaAttribute(['meta[name="citation_title"]'], 'content') || "";
    if (title == ""){
        title = document.querySelector('.article-title-main')? document.querySelector('.article-title-main').innerText.trim() : "";
    }
    let date = getMetaAttribute(['meta[name="citation_publication_date"]'], 'content').replaceAll("/","-") || "";
    if (date == ""){
        date = document.querySelector('.citation-date')? document.querySelector('.citation-date').innerText.match(/\d{4}/)? document.querySelector('.citation-date').innerText.match(/\d{4}/)[0] : "" : "";
    }
    if (date.length == 4){
        date = `${date}-01-01`;
    }
    let authors = getMetaAttributes(['meta[name="citation_author"]'], 'content') || "";
    if (authors == ""){
        authors = Array.from(document.querySelectorAll('.al-authors-list .linked-name')).map(author => author.innerText).join("; ");
    }
    let mf_doi = document.querySelector('meta[name="citation_doi"]')? document.querySelector('meta[name="citation_doi"]').content : "";
    if (mf_doi == ""){
        mf_doi = document.querySelector('.ww-citation-primary')? document.querySelector('.ww-citation-primary').textContent.match(/doi.org.*/)? document.querySelector('.ww-citation-primary').textContent.match(/doi.org.*/)[0].replace("doi.org/", "") : "" : "";
    }
    const mf_journal = getMetaAttribute(['meta[name="citation_journal_title"]'], 'content') || "";
    
    let mf_issn = "";
    let mf_eissn = "";
    Array.from(document.querySelectorAll('.journal-footer-colophon li')).map(elem => {
        let elemText = elem.innerText;
        if (elemText.includes("Online ISSN")){
            mf_eissn = elemText.replace("Online ISSN ", "");
        }
        else if (elemText.includes("Print ISSN")){
            mf_issn = elemText.replace("Print ISSN ", "");
        }
    })
    if (mf_issn == "" && mf_eissn == ""){
        let issns = Array.from(document.querySelectorAll('meta[name="citation_issn"]')).map(elem => elem.content);
        if (issns.length == 2){
            mf_issn = issns[0];
            mf_eissn = issns[1];
        }
        else if (issns.length == 1){
            mf_issn = issns[0];
        }
    }
    
    const publisher = getMetaAttribute(['meta[name="citation_publisher"]'], 'content') || "";
    let volume = romanToNumberOrReturn(getMetaAttribute(['meta[name="citation_volume"]'], 'content')) || "";
    if (volume == ""){
        volume = document.querySelector('.ww-citation-primary')? document.querySelector('.ww-citation-primary').innerText.match(/Volume (\d+), /)? document.querySelector('.ww-citation-primary').innerText.match(/Volume (\d+), /)[1] : "" : "";
    }
    let issue = romanToNumberOrReturn(getMetaAttribute(['meta[name="citation_issue"]'], 'content')) || "";
    if (issue == ""){
        issue = document.querySelector('.ww-citation-primary')? document.querySelector('.ww-citation-primary').innerText.match(/Issue (\d+), /)? document.querySelector('.ww-citation-primary').innerText.match(/Issue (\d+), /)[1] : "" : "";
    }
    // const volume = (document.querySelector('.volume--title')?.textContent.match(/Volume (\d+),/) || [])[1] || '';
    // const issue = (document.querySelector('.volume--title')?.textContent.match(/Issue (\d+)/) || [])[1] || '';

    let first_page = romanToNumberOrReturn(getMetaAttribute(['meta[name="citation_firstpage"]'], 'content') || "");
    let last_page = romanToNumberOrReturn(getMetaAttribute(['meta[name="citation_lastpage"]'], 'content') || "");
    if (first_page == "" && last_page == ""){
        first_page = document.querySelector('.ww-citation-primary')? document.querySelector('.ww-citation-primary').innerText.match(/Pages (\d+)–(\d+)/)? document.querySelector('.ww-citation-primary').innerText.match(/Pages (\d+)–(\d+)/)[1] : "" : "";
        last_page = document.querySelector('.ww-citation-primary')? document.querySelector('.ww-citation-primary').innerText.match(/Pages (\d+)–(\d+)/)? document.querySelector('.ww-citation-primary').innerText.match(/Pages (\d+)–(\d+)/)[2] : "" : "";
    }

    let language = document.querySelector('script[type="application/ld+json"]') ? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)[1] : "" : "";;
    if (language == "en"){
        language = "eng";
    }

    let author_orcids = getOrcids();

    const type = 'article';
    // const language = getMetaAttributes(['meta[name="dc.Language"]'], 'content');
    // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
    const keywords = Array.from(document.querySelectorAll('.kwd-part')).map(keyword => keyword.textContent.trim()).filter(Boolean).join('; ') || '';
    //ABSTRACT
    const abstract = document.querySelector(".abstract")? document.querySelector(".abstract").textContent.trim() : '';

    var metadata = { "202": title, "144": affiliation, "203": date, "200": authors, "233": mf_doi, "232": mf_journal, "184": mf_issn, "185": mf_eissn, "235": publisher, "176": volume, "208": issue, "197": first_page, "198": last_page, "205": language, "239": type, "201": keywords, "81": abstract, '234': author_orcids};
    if (!metadata["202"])
    {
        metadata = false
    }
    return metadata;
};
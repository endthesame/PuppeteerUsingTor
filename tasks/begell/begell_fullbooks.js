module.exports = function extractMetadata() {
    const getMetaAttributes = (selectors, attribute, childSelector) => {
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
    
    function getBookSeries(mf_book) {
        let regexpVolume = /, Volume .*/;
    
        let flag = false;
        let result = Array.from(document.querySelectorAll('#breadcrumbs .breadcrumb-item')).find(elem => {
            if (!flag) {
                flag = elem.innerText.replace(regexpVolume, '') == 'Books';
            } else if (elem.innerText.replace(regexpVolume, '').trim().replaceAll("\n","") == mf_book.replace(regexpVolume, '').trim().replaceAll("\n","")) {
                flag = false;
                return false;
            } else {
                return true;
            }
        });
    
        let finalResult = "";
        if (result){
            finalResult = result.innerText.replace(regexpVolume, '');
        }
        return finalResult;
    }
    
    // let title = getMetaAttributes(['meta[name="dc.Title"]'], 'content')
    // if (title == ""){
    //     title = document.querySelector('.content-title')? document.querySelector('.content-title').innerText : "";
    // }
    let date = document.querySelector('.common-text')? document.querySelector('.common-text').innerText.match(/©\s?(\d{4})/)? document.querySelector('.common-text').innerText.match(/©\s?(\d{4})/)[1] : "" : "";
    if (date == ""){
        date = document.querySelector('.product-head-details .product-head-authors-journal')? document.querySelector('.product-head-details .product-head-authors-journal').innerText.match(/, (\d{4}),/)? document.querySelector('.product-head-details .product-head-authors-journal').innerText.match(/, (\d{4}),/)[1] : "" : "";
    }
    if (date.length == 4){
        date = `${date}-01-01`;
    }
    
    let rawAuthors = Array.from(document.querySelectorAll('.product-head-authors a')).map(author => {
        let node_to_remove = author.querySelector('.visuallyhidden');
        if (node_to_remove) {
            author.removeChild(node_to_remove)
        }
        return author.innerText.trim()
    })
    let authors = Array.from([...new Set(rawAuthors)]).join('; ')
    
    let author_aff = Array.from(document.querySelectorAll('.product-head-authors > div')).map(elem => {
        let author = elem.querySelector('a').innerText.replace("(open in a new tab)").trim();
        let aff = elem.querySelector('span')? elem.querySelector('span').innerText.replace("(open in a new tab)").trim() : "";
        if (aff != "" && author != ""){
            return `${author}:${aff}`;
        }
    }).filter(elem => elem != undefined).join(";; ")
    
    // let rawEditors = Array.from(document.querySelectorAll('.intent_book_editor')).map(elem => elem.innerText.trim())
    // let editors = Array.from([...new Set(rawEditors)]).join('; ')
    
    let mf_doi = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/DOI:\n?(10.*)/)? document.querySelector('.product-head-serials').innerText.trim().match(/DOI:\n?(10.*)/)[1] : "": "";
    // if (mf_doi == ""){
    //     mf_doi = document.querySelector('.article_header-doiurl')?document.querySelector('.article_header-doiurl').innerText?.replaceAll('https://doi.org/', '').replace("DOI: ", "") : "";
    // }
    let mf_book = document.querySelector('.product-head-title')? document.querySelector('.product-head-title').innerText : "";
    //let subtitle = "";
    //let book_series = ""; 
    let mf_isbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN Print:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN Print:\n?([0-9-]+)/)[1] : "": "";
    let mf_eisbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN Online:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN Online:\n?([0-9-]+)/)[1] : "": "";
    if (mf_isbn == ""){
        mf_isbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN CD:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN CD:\n?([0-9-]+)/)[1] : "": "";
    }
    if (mf_isbn == ""){
        let possible_isbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Print:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Print:\n?([0-9-]+)/)[1] : "": "";
        if (possible_isbn.length >= 10){
            mf_isbn = possible_isbn
        }
    }
    if (mf_isbn == ""){
        mf_isbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN:\n?([0-9-]+)/)[1] : "": "";
    }
    if (mf_eisbn == ""){
        let possible_eisbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Online:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Online:\n?([0-9-]+)/)[1] : "": "";
        if (possible_eisbn.length >= 10){
            mf_eisbn = possible_eisbn
        }
    }
    if (mf_eisbn == ""){
        mf_eisbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN online:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN online:\n?([0-9-]+)/)[1] : "": "";
    }

    let print_issn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Print:\n?(\d{4}-\d+[a-zA-Z]?)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Print:\n?(\d{4}-\d+[a-zA-Z]?)/)[1] : "": "";
    let e_issn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Online:\n?(\d{4}-\d+[a-zA-Z]?)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Online:\n?(\d{4}-\d+[a-zA-Z]?)/)[1] : "": "";
    
    //let mf_issn = "";
    //let publisher = "";
    // if (publisher == ""){
    //     publisher = document.querySelector('.NLM_publisher-name')? document.querySelector('.NLM_publisher-name').innerText : "";
    // }
    //const volume = "";
    // const first_page = romanToNumberOrReturn(getMetaAttributes(['meta[name="citation_firstpage"]'], 'content'));
    // const last_page = romanToNumberOrReturn(getMetaAttributes(['meta[name="citation_lastpage"]'], 'content'));
    const pages = document.querySelector('.common-text')? document.querySelector('.common-text').innerText.match(/(\d+) pages,/)? document.querySelector('.common-text').innerText.match(/(\d+) pages,/)[1] : "" : "";
    const type = 'book';
    let abstract = document.querySelector('.common-text')? document.querySelector('.common-text').innerText.trim(): "";
    if (abstract == ""){
        abstract = Array.from(document.querySelectorAll('.common-columns > .common-rows p')).map(elem => elem.innerText.trim()).join(" ")
    }
    // var editors = Array.from(document.querySelectorAll('.cover-image__details-extra ul[title="list of authors"] li')).map(elem => elem.firstChild.innerText).map(elem => elem.replace("Editors:", "")).map(elem => elem.replace("Editor:", "")).map(elem => elem.replace(",", "")).filter(function(element) {
    //     return element !== "" && element !== " ";
    //   }).join("; ");
    // if (editors.includes("Author")){
    //     editors = "";
    // }
    
    //const volume 
    
    // let language = getMetaAttributes(['meta[name="dc.Language"]'], 'content');
    // if (language == "en"){
    //     language = "eng";
    // }
    // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
    // let rawKeywords =Array.from(document.querySelectorAll('#keywords_list .intent_text')).map(elem => elem.innerText.replaceAll(",", "").trim())
    // let keywords =Array.from([...new Set(rawKeywords)]).join('; ')
    // if (keywords == ""){
    //     keywords = getMetaAttributes(['meta[name="keywords"]'], 'content')
    // }   
    //ABSTRACT
    // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
    // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    // const abstractTexts = [];
    // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
    //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
    // }
    // const abstract = abstractTexts.join(' ') || "";
    // const abstract = document.querySelector('.intent_book_synopsis')? document.querySelector('.intent_book_synopsis').innerText.trim().replaceAll("\n", " ") : "";
    // let affiliation = Array.from(document.querySelectorAll('#contribAffiliations .intent_contributor'))
    // .filter(elem => {
    //     let author = elem.querySelector('.contrib-search-book-part-meta')? elem.querySelector('.contrib-search-book-part-meta').innerText.trim() : "";
    //     let affilation = elem.querySelector('.intent_contributor_affiliate')? elem.querySelector('.intent_contributor_affiliate').innerText.trim().replaceAll("(", "").replaceAll(")", "") : "";
    //     return author != "" && affilation.length != "";
    // })
    // .map(elem => {
    //     let author = elem.querySelector('.contrib-search-book-part-meta').innerText.trim();
    //     let affilation = elem.querySelector('.intent_contributor_affiliate').innerText.trim().replace("(", "").replace(")", "");
    //     return `${author}:${affilation}`;
    // })
    // .join(";; ");
    
    // let orcids = Array.from(document.querySelectorAll('.loa .hlFld-Affiliation')).map(elem => {
    //     let authorNameElement = elem.querySelector('.loa-info-name');
    //     let orcidElements = elem.querySelectorAll('.loa-info-orcid');
      
    //     if(authorNameElement && orcidElements.length > 0) {
    //       let authorName = authorNameElement.innerText;
    //       let orcids = Array.from(orcidElements).map(aff => aff.innerText).join('!');
    //       return `${authorName}::${orcids}`;
    //     }
    //   }).filter(item => item !== undefined).join(";;");
    
    //Type
    // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
    var metadata = { '200': authors, '203': date, '240': mf_isbn, '241': mf_eisbn, '239': type, '242': mf_book, '144': author_aff, '193': pages, '81': abstract, '233': mf_doi, '184': print_issn, '185': e_issn};
    if (!metadata["242"])
    {
        metadata = false
    }
    return metadata;
};


const moment = require('moment');

module.exports = plugin;

function plugin(opts) {
    var groups = {}
    var exceptions = ["path", "override_permalink_group", "page_layout", "date_page_layout", "expose", "date_format", "per_page", "page_description", "num_format", "reverse", "no_folder", "search_type", "add_prop", "change_extension", "page_only"]
    if (typeof opts.drafts == "undefined") {
        opts.drafts = false
    }
    opts.search_type = opts.search_type || "all"
    for (group in opts.groups) {
        opts.groups[group].search = Object.keys(opts.groups[group]).map(key => {
            if (!exceptions.includes(key)) { //add new non-search options here
                var obj = {}
                obj[key] = opts.groups[group][key]
                return obj
            }
        }).filter(property => {return typeof property !== "undefined"})
    }
    var default_safe = function (string) {
        return string.replace(/(-|\/)/g, "").replace(/(\'|\"|\(|\)|\[|\]|\?|\+)/g, "").replace(/(\s)+/g, "-").toLowerCase()
    }
    var make_safe = typeof opts.make_safe !== "undefined" ? opts.make_safe : default_safe
    function contains(data, property_val) {
        if (typeof property_val === "boolean") {
            if (property_val === true && typeof data !== "undefined") {
                return true
            } else {
                return false
            }
        }
        if (typeof data == "string") {
            data = data.split(",")
        }
        if (typeof data !== "undefined") {
            data = data.map(tag => {
                var tag = make_safe(String(tag).trim())
                return tag
            })
        }
        if (Array.isArray(data)) {
            return data.includes(make_safe(property_val))
        }
    }
    function match(data, group, searchtype) {
        var search = opts.groups[group].search
        if (search.length == 0) {
            return match = true
        }
        for (property in search) {
            var propertyname = Object.keys(search[property])
            var propertyvalue = search[property][propertyname]
            if (searchtype == "all") {
                var match = true
                if (contains(data[propertyname], propertyvalue) && match !== false) {
                    match = true
                } else {match = false}
            } else if (searchtype == "any") {
                var match = false
                if (contains(data[propertyname], propertyvalue)) {
                    match = true
                    break
                }
            }
        }
        return match
    }
    function sort_post(groups, group, file, post) {
        var expose = opts.groups[group].expose
        var expose_value = opts.groups[group][expose]
        if (expose) {
            if (typeof expose_value == "undefined") { //e.g. expose:tags but no specific tag defined, it'll expose all
                for (property in post[expose]) { //no need to get list of tags, for each tag in post it's "pushed" to it's tags
                    push_to_group(groups, group, file, post, post[expose][property])
                }
            } else {
                push_to_group(groups, group, file, post, expose_value) //e.g. expose:tags, tags: post
            }
        } else {
            push_to_group(groups, group, file, post) //don't expose anything
        }
    }
    function push_to_group(groups, group, file, post, expose) {
        if (typeof post.title == "undefined") {
           throw new Error("File " + file +" missing title. If the file has a title, make sure the frontmatter is formatted correctly.")
        }
        post.original_contents = new Buffer(post.contents.toString())
        let pathreplace = {}
        if (typeof post.slug !== "undefined") {
            pathreplace.title = post.slug
        } else {
            pathreplace.title = make_safe(post.title)
        }
        if (typeof post.permalink == "undefined") { //because the object is just being referenced, it might have already been set
            let permalink_group = opts.permalink_group
            pathreplace.group = group
            if (typeof opts.groups[permalink_group].date_format !== "undefined") {
                pathreplace.date = moment(post.date).format(opts.groups[permalink_group].date_format)
            }
            post.permalink = "/" + opts.groups[permalink_group].path.replace(/\/{num}/g, "").replace(/{(.*?)}/g, function (match, matched_group) {
                return pathreplace[matched_group]
            })
        }
        if (typeof opts.groups[group].override_permalink_group !== "undefined") {
            pathreplace.group = group
            if (typeof opts.groups[group].override_permalink_group.date_format !== "undefined") {
                pathreplace.date = moment(post.date).format(opts.groups[group].override_permalink_group.date_format)
            }
            if (typeof opts.groups[group].path == "undefined") {
                var path = "{group}/{title}"
            } else {
                var path = opts.groups[group].path
            }
            post.permalink = "/" + path.replace(/\/{num}/g, "").replace(/{(.*?)}/g, function (match, matched_group) {
                return pathreplace[matched_group]
            })
        }
        if (typeof opts.groups[group].add_prop !== "undefined") {
            for (set in opts.groups[group].add_prop) {
                var prop = Object.keys(opts.groups[group].add_prop[set])[0]
                post[prop] = opts.groups[group].add_prop[set][prop]
            }
        }
        groups[group] = groups[group] || {}
        if (expose) {
            groups[group][expose] = groups[group][expose] || {}
            groups[group][expose].files = groups[group][expose].files || []
            groups[group][expose].files.push(post)
        } else {
            if (typeof opts.groups[group].date_format !== "undefined") {
                let dateItems = opts.groups[group].date_format
                dateItems = dateItems.split("/")
                let initial = 1
                for (item in dateItems) {
                    let format = dateItems.slice(0, initial).join("/")
                    let dategroup = moment(post.date).format(format)
                    groups[group].dates = groups[group].dates || {}
                    groups[group].dates[dategroup] = groups[group].dates[dategroup] || {}
                    groups[group].dates[dategroup].files = groups[group].dates[dategroup].files || []
                    groups[group].dates[dategroup].files.push(post)
                    initial++
                }
            }
            groups[group].files = groups[group].files || []
            groups[group].files.push(post)
        }
    }
    function order (a,b) {
        if (typeof opts.groups[group].reverse !== "undefined" &&  opts.groups[group].reverse == false) {
            return a.date - b.date
        } else {
            return b.date - a.date
        }
    }
    return function(files, metalsmith, done){
        for (file in files) {
            let post = files[file]
            for (group in opts.groups) {
                if (opts.drafts == false && (post.draft == true || post.draft == "true" || post.published == false || post.published == "false" || post.status == "draft")) {
                    //if draft check
                    continue
                }
                if (match(post, group, opts.groups[group].match || opts.search_type)) {
                    sort_post(groups, group, file, post)
                }
            }
        }
        for (group in groups) {
            var expose = opts.groups[group].expose
            if (expose) {
                for (exposed in groups[group]) { //TODO use exposed?
                    groups[group][exposed].files = groups[group][exposed].files.map(post =>{
                        return post
                    }).sort(order)
                }
            } else {
                for (group in groups) { //TODO use exposed?
                    //console.log(typeof groups[groups].files == "undefined")
                    if(typeof groups[group].files !== "undefined") {//don't overwrite exposed groups
                        groups[group].files = groups[group].files.map(post =>{
                            return post
                        }).sort(order)
                    }
                }
            }
        }
        //delete original file list
        for (file in files) {delete files[file]}
        function assignPath(obj, path, value) {
            last = path.length - 1;
            for (var i = 0; i < last; i++) {
                key = path[i];
                if (typeof obj[key] == "undefined") {
                    obj[key] = {}
                }
                obj = obj[key];
            }
            obj[path[last]] = value;
        }
        for (group in groups) {
            var expose = opts.groups[group].expose
            var expose_value = opts.groups[group][expose]
            var pathreplace = {group: group}
            var layout = opts.groups[group].page_layout || "index"
            var extension = typeof opts.groups[group].change_extension !== "undefined" ? opts.groups[group].change_extension : ".html"
            page_parser(files)
            post_parser(files)
        }
        function page_parser () {
            if (opts.groups[group].path == "{title}" || (group == opts.permalink_group && opts.groups[group].override_permalink_group == false)) {return}
            var extension = typeof opts.groups[group].change_extension !== "undefined" ? opts.groups[group].change_extension : ".html"
            var largegroup = groups[group]
            if (typeof largegroup.dates !== "undefined") {
                largegroup = largegroup.dates
            }
            for (minigroup in largegroup) {
                if (typeof largegroup[expose_value] !=="undefined") {
                    var page_files = largegroup[expose_value].files
                } else if (typeof largegroup[minigroup] !== "undefined" &&
                minigroup !== "files") {
                    var page_files = largegroup[minigroup].files
                } else {
                    var page_files = largegroup.files
                }
                if (typeof expose !== "undefined" && typeof expose_value == "undefined") { //individual txnms
                    metalsmith._metadata.site[expose] = metalsmith._metadata.site[expose] || {}
                    let nicename = make_safe(minigroup)
                    let count = page_files.length
                    metalsmith._metadata.site[expose][minigroup] = {nicename: nicename, count:count}
                } else if (typeof expose !== "undefined" ) {} else if (minigroup !== "files"){ //dates
                    if (moment(minigroup, opts.groups[group].date_format, true).isValid()) {
                        //path
                        metalsmith._metadata.site.dates = metalsmith._metadata.site.dates || {}
                        let dateItems = minigroup
                        let count = page_files.length
                        dateItems = dateItems.split("/")
                        assignPath(metalsmith._metadata.site.dates, dateItems, {date: minigroup, count:count, files: page_files})
                    }
                    //layout
                    var date_layout = opts.groups[group].date_page_layout.split("/")
                    var current_layout = minigroup.split("/").length - 1
                    layout = date_layout[current_layout]
                }
                var pages = []
                var per_page = opts.groups[group].per_page || page_files.length //don't use infinity
                var total_pages = Math.ceil(page_files.length / per_page)
                if (total_pages == 0) {total_pages = 1}
                for (i = 0; i < total_pages; i++) {
                    var this_page_files = page_files.slice(i * per_page, (i+1) * per_page)
                    if (i !== 0) {
                        pathreplace.num = i + 1
                    } else {
                        delete pathreplace.num
                    }
                    if (typeof opts.groups[group].date_format !== "undefined") {
                        pathreplace.date = minigroup
                    }
                    if (expose || expose_value) {
                        pathreplace.expose = expose_value || minigroup
                        pathreplace.expose = make_safe(pathreplace.expose)
                    }
                    let path = opts.groups[group].path.replace(/{title}/g, "").replace(/{(.*?)}/g, function (match, matched_group) {
                        if (typeof pathreplace[matched_group] !== "undefined") {
                            if (matched_group == "num" && typeof opts.groups[group].num_format !== "undefined") {
                                return opts.groups[group].num_format.replace(/{(.*?)}/g, function (match, matched_group) {return pathreplace[matched_group]})
                            }
                            return pathreplace[matched_group]
                        } else {return ""}
                    }).replace(/(\/)+/g, "\/").replace(/.$/m, match => {
                        if (match !== "\/"){
                            return match+"/"
                        } else {
                            return match
                        }
                    })
                    if (typeof opts.groups[group].page_only !== "undefined" && opts.groups[group].page_only == true && typeof opts.groups[group].no_folder !== "undefined" && opts.groups[group].no_folder == true) {
                        var filename = ""
                        path = path.slice(0, path.length - 1)
                    } else {
                        var filename = "index"
                    }
                    var page = {
                        layout: layout,
                        group: group,
                        contents: new Buffer(''),
                        pagination: {
                            index: pages.length,
                            num: pages.length + 1,
                            pages: pages,
                            files: this_page_files,
                            total: total_pages,
                        },
                        path: path + filename + extension,
                        permalink: "/"+path
                    }
                    //metalsmith._metadata.site.categories = {}
                    //console.log(metalsmith._metadata.site.categories);
                    if (typeof expose_value !== "undefined") { //special pages
                        page.exposed = expose
                        page.exposed_value = expose_value
                    } else if (typeof expose !== "undefined") { //individual txnms
                        page.exposed = expose
                        page.expose_value = minigroup
                    } else if (minigroup !== "files"){ //dates ???why did i comment this out before?
                        page.exposed = minigroup
                    }
                    if (typeof opts.groups[group].page_description !== "undefined") {
                        page.page_description = opts.groups[group].page_description
                    }
                    if (total_pages !== 1 && i !== 0) {
                        page.pagination.prev = pages[i - 1]
                        pages[i - 1].pagination.next = page
                    }
                    if (page.pagination.num == page.pagination.total) {
                        for (x = 2; x < page.pagination.total + 1; x++) { //don't get last page by starting at 2, but get page 0 by adding 1
                            var thispage = page.pagination.total - x
                            pages[thispage].pagination.total_pages_permalink = page.permalink
                        }
                        page.pagination.total_pages_permalink = page.permalink
                    }
                    return_page(page, files, pages)
                }
            }
        }
        function post_parser () {
            if (typeof opts.groups[group].page_only !== "undefined" && opts.groups[group].page_only == true) {
                return
            }
            if (group == opts.permalink_group || opts.groups[group].override_permalink_group == true) {
                for (post in groups[group].files) {
                    var postpage = Object.assign({}, groups[group].files[post]) //reference to group was being overwritten
                    if (typeof opts.groups[group].no_folder !== "undefined" && opts.groups[group].no_folder == true){
                        postpage.path = postpage.permalink.replace(/\/||\\/, "") + extension
                    } else {
                        postpage.path = postpage.permalink.replace(/\/||\\/, "") + "/index" + extension
                    }
                    let next = parseInt(post) + 1
                    if (typeof groups[group].files[next] !== "undefined") {
                        postpage.pagination = postpage.pagination || {}
                        postpage.pagination.next = groups[group].files[next]
                    }
                    let prev = parseInt(post) - 1
                    if (prev >= 0 && typeof groups[group].files[prev] !== "undefined") {
                        postpage.pagination = postpage.pagination || {}
                        postpage.pagination.prev = groups[group].files[prev]
                    }
                    postpage.group = group
                    return_page(postpage, files)
                }
            }
        }
        function return_page(page, files, pages) {
            files[page.path] = page;
            if (typeof pages !== "undefined") {
                pages.push(page)
            }
        }
        done()
    }
}

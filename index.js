const moment = require('moment');

module.exports = plugin;

function plugin(opts) {
    //SORT OPTIONS

    //all our exempted properties
    var exceptions = ["group_name", "path", "override_permalink_group", "page_layout", "date_page_layout", "expose", "date_format", "per_page", "page_description", "num_format", "reverse", "no_folder", "search_type", "add_prop", "change_extension", "page_only"]
    if (typeof opts.drafts == "undefined") {
        opts.drafts = false
    }
    //create list for documentation
    //console.log("`"+exceptions.sort().join("`, `")+"`");

    //define global search type if none given.
    opts.search_type = opts.search_type || "all"

    //get search criteria for each group
    for (group_index in opts.groups) {
        opts.groups[group_index].search = Object.keys(opts.groups[group_index]).map(criteria => {
            if (!exceptions.includes(criteria)) { //add new non-search options here
                var obj = {}
                obj[criteria] = opts.groups[group_index][criteria]
                return obj
            }
        }).filter(property => {return typeof property !== "undefined"})
    }
    //UTILITIES
    
    //the default make_save function for titles, does not apply to slugs (on purpose)
    var default_safe = function (string) {
        return string.replace(/(-|\/)/g, "").replace(/(\'|\"|\(|\)|\[|\]|\?|\+)/g, "").replace(/(\s)+/g, "-").toLowerCase()
    }
    //let user override
    var make_safe = typeof opts.make_safe !== "undefined" ? opts.make_safe : default_safe

    function get_group_index(group_name) {
        for (group_index in opts.groups) {
            if (opts.groups[group_index].group_name == group_name) {
                return group_index
            }
        }
    }
    //for assigning date data to metalsmith_.metadata
    function assign_path(obj, path, value) {
        last = path.length - 1;
        for (var i = 0; i < last; i++) {
            key = path[i];
            if (typeof obj[key] == "undefined") {
                obj[key] = {}
            }
            obj = obj[key];
        }
        obj[path[last]] = value;
        // return obj
    }
    //sort function for group dates
    function order(a,b) {
        if (typeof opts.groups[group_index].reverse !== "undefined" &&  opts.groups[group_index].reverse == false) {
            return a.date - b.date
        } else {
            return b.date - a.date
        }
    }

    //PLUGIN
    return function(files, metalsmith, done){
        //empty group array to push results to
        var groups = []
        for (file in files) {
            let post = files[file]
            for (group_index in opts.groups) {
                let group = opts.groups[group_index]
                //if draft check
                if (opts.drafts == false && (post.draft == true || post.draft == "true" || post.published == false || post.published == "false" || post.status == "draft")) {
                    continue
                }
                //see if post specifies search_type
                var search_type = typeof opts.groups[group_index].search_type !== "undefined" ? opts.groups[group_index].search_type : opts.search_type
                //check if post matches criteria then send the post to sort if it does
                if (match(post, group_index, search_type)) {
                    sort_post(groups, group_index, file, post)
                }
            }
        }

        //returns whether a post matches our criteria or not
        function match(data, group_index, search_type) {
            var search = opts.groups[group_index].search
            if (search.length == 0) {
                return match = true
            }
            var match = true
            for (property in search) {
                var propertyname = Object.keys(search[property])
                var propertyvalue = search[property][propertyname]
                if (search_type == "all") {
                    if (contains(data[propertyname], propertyvalue) && match !== false) {
                        match = true
                    } else {match = false}
                } else if (search_type == "any") {
                    match = false
                    if (contains(data[propertyname], propertyvalue)) {
                        match = true
                        break
                    }
                }
            }
            return match
        }

        //checks individual values of post and returns whether there's a match to the match function
        function contains(data, property_val) {
            if (typeof property_val === "boolean") { //for when we just want to check if a property exists
                if (property_val == true && typeof data !== "undefined") {
                    return true
                } else if (property_val == true && typeof data == "undefined") {
                    return false
                } else if (property_val == false && typeof data == "undefined") {
                    return true
                } else if (property_val == false && typeof data !== "undefined")  {
                    return false
                }
            }
            if (typeof data !== "undefined") {//for checking strings and arrays against our search criteria values
                if (typeof data == "string" && make_safe(data) == make_safe(property_val)) {
                    return true
                }
                if (Array.isArray(data)) {
                    data = data.map(tag => {
                        var tag = make_safe(String(tag).trim())
                        return tag
                    })
                    return data.includes(make_safe(property_val))
                }
            }
        }

        //once we know a post matches our criteria it's sorted into the right group
        function sort_post(groups, group_index, file, post) {
            var expose = opts.groups[group_index].expose
            var expose_value = opts.groups[group_index][expose]
            if (expose) {
                if (typeof expose_value == "undefined") { //e.g. expose:tags but no specific tag defined, it'll expose all
                    for (property in post[expose]) { //no need to get list of tags, for each tag in post it's "pushed" to it's tags
                        push_to_group(groups, group_index, file, post, post[expose][property])
                    }
                } else {
                    push_to_group(groups, group_index, file, post, expose_value) //e.g. expose: tags, tags: post
                }
            } else {
                push_to_group(groups, group_index, file, post) //don't expose anything
            }
        }

        //from sort_post we actually push to our empty group array
        function push_to_group(groups, group_index, file, post, expose) {
            var group_name = opts.groups[group_index].group_name
            if (typeof post.title == "undefined") {
                throw new Error("File " + file +" missing title. If the file has a title, make sure the frontmatter is formatted correctly.")
            }
            post.original_contents = new Buffer(post.contents.toString())
            //sort out the path for the post
            let pathreplace = {}
            if (typeof post.slug !== "undefined") {
                pathreplace.title = post.slug //do not make_safe the slug on purpose
            } else {
                pathreplace.title = make_safe(post.title)
            }
            //normal groups
            if (typeof post.permalink == "undefined") { //because the object is just being referenced, it might have already been set
                let permalink_group = get_group_index(opts.permalink_group)
                pathreplace.group = group_name
                if (typeof opts.groups[permalink_group].date_format !== "undefined") {
                    pathreplace.date = moment(post.date).format(opts.groups[permalink_group].date_format)
                }
                post.permalink = "/" + opts.groups[permalink_group].path.replace(/\/{num}/g, "").replace(/{(.*?)}/g, function (match, matched_group) {
                    return pathreplace[matched_group]
                })
            }
            //groups that override the permalink
            if (typeof opts.groups[group_index].override_permalink_group !== "undefined") {
                pathreplace.group = group_name
                if (typeof opts.groups[group_index].override_permalink_group.date_format !== "undefined") {
                    pathreplace.date = moment(post.date).format(opts.groups[group_index].override_permalink_group.date_format)
                }
                if (typeof opts.groups[group_index].path == "undefined") {
                    var path = "{group}/{title}"
                } else {
                    var path = opts.groups[group_index].path
                }
                post.permalink = "/" + path.replace(/\/{num}/g, "").replace(/{(.*?)}/g, function (match, matched_group) {
                    return pathreplace[matched_group]
                })
            }
            //add any properties specified
            if (typeof opts.groups[group_index].add_prop !== "undefined") {
                for (set in opts.groups[group_index].add_prop) {
                    var prop = Object.keys(opts.groups[group_index].add_prop[set])[0]
                    post[prop] = opts.groups[group_index].add_prop[set][prop]
                }
            }
            //actually push to group
            groups[group_index] = groups[group_index] || {}
            if (expose) {
                groups[group_index][expose] = groups[group_index][expose] || {}
                groups[group_index][expose].files = groups[group_index][expose].files || []
                groups[group_index][expose].files.push(post)
            } else {
                if (typeof opts.groups[group_index].date_format !== "undefined") {
                    let dateItems = opts.groups[group_index].date_format
                    dateItems = dateItems.split("/")
                    let initial = 1
                    for (item in dateItems) {
                        let format = dateItems.slice(0, initial).join("/")
                        let dategroup = moment(post.date).format(format)
                        groups[group_index].dates = groups[group_index].dates || {}
                        groups[group_index].dates[dategroup] = groups[group_index].dates[dategroup] || {}
                        groups[group_index].dates[dategroup].files = groups[group_index].dates[dategroup].files || []
                        groups[group_index].dates[dategroup].files.push(post)
                        initial++
                    }
                }
                groups[group_index].files = groups[group_index].files || []
                groups[group_index].files.push(post)
            }
        }
        //end of push_to_group

        //once we have out new group object sort it by date if necessary
        for (group_index in groups) {
            var expose = opts.groups[group_index].expose
            if (expose) {
                for (expose in groups[group_index]) {
                    groups[group_index][expose].files = groups[group_index][expose].files.map(post =>{
                        return post
                    }).sort(order)
                }
            } else {
                //console.log(typeof groups[groups].files == "undefined")
                if(typeof groups[group_index].files !== "undefined") {//don't overwrite exposed groups
                    groups[group_index].files = groups[group_index].files.map(post =>{
                        return post
                    }).sort(order)
                }
            }
        }
        //delete original file list
        for (file in files) {
            delete files[file]
        }

        //with our new groups array go through them and push our final files to our files list
        for (group_index in groups) {
            var expose = opts.groups[group_index].expose
            var expose_value = opts.groups[group_index][expose]
            var pathreplace = {group: opts.groups[group_index].group_name}
            var group_name = opts.groups[group_index].group_name
            var layout = opts.groups[group_index].page_layout || "index"
            var extension = typeof opts.groups[group_index].change_extension !== "undefined" ? opts.groups[group_index].change_extension : ".html"
            page_parser(files)
            post_parser(files)
        }

        //for pages
        function page_parser () {
            //return when path does not allow page to be made or when we're in the permalink group
            if (opts.groups[group_index].path == "{title}" || (group_name == opts.permalink_group && opts.groups[group_index].override_permalink_group == false)) {return}
            //set largegroup to more clearly understand what's being iterated over
            var largegroup = groups[group_index]
            if (typeof largegroup.dates !== "undefined") {
                largegroup = largegroup.dates
            }
            for (minigroup in largegroup) {
                //determines where exactly the files are
                if (typeof largegroup[expose_value] !== "undefined") { //exposed value
                    var page_files = largegroup[expose_value].files
                } else if (typeof largegroup[minigroup] !== "undefined" && minigroup !== "files") { //dates
                    var page_files = largegroup[minigroup].files
                } else { //normal pages
                    var page_files = largegroup.files
                }
                //push any exposed information to metalsmith._metadata and handle path for dates layout
                if (typeof expose !== "undefined" && typeof expose_value == "undefined") { //exposed values
                    metalsmith._metadata.site[expose] = metalsmith._metadata.site[expose] || {}
                    let nicename = make_safe(minigroup)
                    let count = page_files.length
                    metalsmith._metadata.site[expose][minigroup] = {nicename: nicename, count:count}
                } else if (typeof expose == "undefined" && minigroup !== "files"){ //dates
                    //metadata
                    if (moment(minigroup, opts.groups[group_index].date_format, true).isValid()) {
                        metalsmith._metadata.site.dates = metalsmith._metadata.site.dates || {}
                        let dateItems = minigroup
                        let count = page_files.length
                        dateItems = dateItems.split("/")
                        assign_path(metalsmith._metadata.site.dates, dateItems, {date: minigroup, count:count, files: page_files})
                    }
                    //layout
                    var date_layout = opts.groups[group_index].date_page_layout.split("/")
                    var current_layout = minigroup.split("/").length - 1
                    layout = date_layout[current_layout]
                }
                //now that we have our files and variables split files into pages
                var pages = []
                var per_page = opts.groups[group_index].per_page || page_files.length //don't use infinity
                var total_pages = Math.ceil(page_files.length / per_page)
                if (total_pages == 0) {total_pages = 1}
                for (i = 0; i < total_pages; i++) {
                    var this_page_files = page_files.slice(i * per_page, (i+1) * per_page)
                    //get variables for path
                    if (i !== 0) {
                        pathreplace.num = i + 1
                    } else {
                        delete pathreplace.num
                    }
                    if (typeof opts.groups[group_index].date_format !== "undefined") {
                        pathreplace.date = minigroup
                    }
                    if (expose || expose_value) {
                        pathreplace.expose = expose_value || minigroup
                        pathreplace.expose = make_safe(pathreplace.expose)
                    }
                    //create path by replacing variables
                    let path = opts.groups[group_index].path.replace(/{title}/g, "").replace(/{(.*?)}/g, function (match, matched_group) {
                        if (typeof pathreplace[matched_group] !== "undefined") {
                            if (matched_group == "num" && typeof opts.groups[group_index].num_format !== "undefined") {
                                return opts.groups[group_index].num_format.replace(/{(.*?)}/g, function (match, matched_group) {return pathreplace[matched_group]})
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
                    //allows user to change filename
                    if (typeof opts.groups[group_index].page_only !== "undefined" && opts.groups[group_index].page_only == true && typeof opts.groups[group_index].no_folder !== "undefined" && opts.groups[group_index].no_folder == true) {
                        var filename = ""
                        path = path.slice(0, path.length - 1)
                    } else {
                        var filename = "index"
                    }
                    //create our page object
                    var page = {
                        layout: layout,
                        group: group_name,
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
                    //add exposed and exposed_value to pages that have it
                    if (typeof expose_value !== "undefined") { //special pages //e.g. expose: tags, tags: post
                        page.exposed = expose
                        page.exposed_value = expose_value
                    } else if (typeof expose !== "undefined") { //pages which expose all
                        page.exposed = expose
                        page.exposed_value = minigroup
                    } else if (minigroup !== "files"){//dates
                        page.exposed = "dates"
                        page.exposed_value = minigroup
                    }
                    //adds a page description if it exists
                    if (typeof opts.groups[group_index].page_description !== "undefined") {
                        page.page_description = opts.groups[group_index].page_description
                    }
                    //append previous page to pagination
                    if (total_pages !== 1 && i !== 0) {
                        page.pagination.prev = pages[i - 1]
                        pages[i - 1].pagination.next = page
                    }
                    //add total number of pages when on last page
                    if (page.pagination.num == page.pagination.total) {
                        for (x = 2; x < page.pagination.total + 1; x++) { //don't get last page by starting at 2, but get page 0 by adding 1
                            let thispage = page.pagination.total - x
                            pages[thispage].pagination.total_pages_permalink = page.permalink
                        }
                        page.pagination.total_pages_permalink = page.permalink
                    }
                    return_page(page, files, pages)
                }
            }
        }
        //post files
        function post_parser () {
            //ignore pages_only group
            if (typeof opts.groups[group_index].page_only !== "undefined" && opts.groups[group_index].page_only == true) {
                return
            }
            //make sure we're in a permalink group or the group allows overriding
            if (group_name == opts.permalink_group || opts.groups[group_index].override_permalink_group == true) {
                for (post in groups[group_index].files) {
                    var postpage = Object.assign({}, groups[group_index].files[post]) //reference to group_name was being overwritten
                    //change path if we want no fodler
                    if (typeof opts.groups[group_index].no_folder !== "undefined" && opts.groups[group_index].no_folder == true){
                        postpage.path = postpage.permalink.replace(/\/||\\/, "") + extension
                    } else {
                        postpage.path = postpage.permalink.replace(/\/||\\/, "") + "/index" + extension
                    }
                    //handle pagination of posts
                    let next = parseInt(post) + 1
                    if (typeof groups[group_index].files[next] !== "undefined") {
                        postpage.pagination = postpage.pagination || {}
                        postpage.pagination.next = groups[group_index].files[next]
                    }
                    let prev = parseInt(post) - 1
                    if (prev >= 0 && typeof groups[group_index].files[prev] !== "undefined") {
                        postpage.pagination = postpage.pagination || {}
                        postpage.pagination.prev = groups[group_index].files[prev]
                    }
                    postpage.group = group_name
                    return_page(postpage, files)
                }
            }
        }
        //final function to push to files list
        function return_page(page, files, pages) {
            files[page.path] = page;
            if (typeof pages !== "undefined") {
                pages.push(page)
            }
        }
        done()
    }
}

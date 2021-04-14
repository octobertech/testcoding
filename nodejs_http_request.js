async function getUsernames(threshold) {
    let pageNum = 1, allPages = 0, result = []
    
    const processResult = async (data) => {
        const reqData = JSON.parse(data)
        allPages = reqData.total_pages
        for (let u of reqData.data) {
            if (u.submission_count > threshold) {
                result.push(u.username)
            }
        } 
        pageNum++
        if (pageNum <= allPages) {
            await callApi()
        }
    } 
    
    const callApi = async () => {
        return new Promise((resolve, reject) => {
            https.get('https://jsonmock.hackerrank.com/api/article_users?page='+pageNum,  (resp) => {
                let jsonData = '';
                resp.on('data', (chunk) => {
                    jsonData += chunk;
                })
                resp.on('error', reject);
                resp.on('end', () => {
                    resolve(processResult(jsonData))
                })
            })
             
        })
    }
    await callApi()
    return result
}

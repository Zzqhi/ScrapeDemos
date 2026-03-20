/**
 * 将cookie转换成字典
 * @param {string} cookieStr 
 * @returns 字典格式的cookie
 */
function getCookies(cookieStr) {
    return Object.fromEntries(
        cookieStr
            .split(';')
            .map(item => item.trim())
            .filter(item => item.includes('=')) // 过滤 Secure 这种
            .map(item => {
                const [key, ...rest] = item.split('=');
                return [key, rest.join('=')]; // 防止 value 里有 '='
            })
    )
}
// 第一次 https://www.ihg.com/SO-eswJZvJovtyUS_Q/azD7rQuNOEOGzfp3Oa/BUYyEwh-WAY/NEVTW/BZjb2YB Set-Cookie second
// const first = getCookies(`_abck=A2946CBBE0E9E973B2AAA40D075716EA~-1~YAAQLg7SF0Uuyf6cAQAAx5XnCA8ce3jeaqJybD8QKvvpd8OQc4RgK9LDmsdT6NnVg4uDJASy0GhYKIOnKRbWTN0lmdwTuSwBG49ckNfRCIq/CRMp8BjDdzCcD70fPbdxrrNeAjTJ95GLKC8LpmAQqCG8Qs1U0qGp0q01N26Q4eQZ47FVEb4vlsd9x2GudQ2+4DDl4fi5EXkxOWkqC2rR8VXaCj1V3R9JAE1EFyFz9eptL2CMr1Tkk0If9aEoWiJnQjoRO2cRSIqV3IBSZQSF7HhztsufRTXenqatgWsm+3mPuDSY1ow8E5GIZlEWjJetW/3i+MUJR6wSU3KtKVPYcXEhIzEY0Vijf1F3OsxK1E9X0IQklwvMHxXs4rqRtIOA+JKwilijB8YJ/3jSzZCTPr6f6aebHMgGDANqGY+cWJsA1oQ/cbHYWb8D5ma32on/8ZlG7nLX9ws9In6kWDPI9naGAHQ99z2QoXKiBkq2yhmEaZ2BPedq1ST1Nr4pnC23Dk6JoF9IdoPRXu9exiuUXthT21sOHZBm2cKjWduwKpDPfs18S7ccFkKIUfXsK7iOiitSoGuvgPz9iX+Vo5QJRRKIc0aEaaJxN5MSH6h06M81MpzUuju+5okiJoKH6K9OorEkh+zMLg/7GVCGK7/mldU6KEbmBcA8xvHmGsT9NtJC/erxb7Mr~-1~-1~1773974143~AAQAAAAF%2f%2f%2f%2f%2f+aeX4nqmDCvodYhHwe%2fA+%2fFfRrXpNSpMv8LCDUUmoQWkLjPW4t3aGfB07JEQlR0+pBfGDxqVdbWNyHMxj6Q7A3Oo3X1mk9227K9Z88uWDFq0msAJ7hjhl7vrW+Mgtzj2j+0JE8%3d~1773970948; Domain=.ihg.com; Path=/; Expires=Sat, 20 Mar 2027 01:41:28 GMT; Max-Age=31536000; Secure`)
// console.log(first)

// // 第二次 Set-Cookie 拿到second
// const second = getCookies(`ak_bmsc=517D944D0E9E53672D19746537FAF801~000000000000000000000000000000~YAAQxqbcF0fSXd2cAQAAuz/iCB+vQsi75ZvMZ0wwfLDUC7518MgUpaDqVcs/yNaPXz43+EQyXrWBD7blVc4Tv/C37zEnGRYrCrYxJIespf+Iw+IdwaCPxpDbpEfGY9cn/2nqUypco00dCNUGg7YU1nELXkHMnE2MhnyhxNQqTRZVrilABT1rn83V171n/IpFmuaIi6PPgErpMhhG0kYgqXQ/3CMxjO5c8UTr1EYiQKemejzjYTTmBtaPAv32IEI44CB+oPf1aePEnJJTnUx5fMYuDebhv7ffK8lNRT4/J0+W8AAAbA32vJ7P/oCpDIzRGJ0jAx4jRh+dc0IuFp//J5lmM2/llNSCsM70TkU9Tq2ic1+U5wJSyVtasUo34j47XSyKddSgnsIR; AMCV_8EAD67C25245B1870A490D4C%40AdobeOrg=179643557%7CMCIDTS%7C20533%7CMCMID%7C15404505983960404318314434846403887371%7CvVersion%7C5.5.0; at_check=true; gig_bootstrap_4_jpzahMO4CBnl9Elopzfr0A=identity_ver4; TAsessionID=5c9794a5-2e0c-443f-a6af-5cc7a9bf3ec4|NEW; notice_behavior=implied,eu; s_inv=0; s_vnc365=1805506557004%26vn%3D1; s_ivc=true; s_cc=true; notice_preferences=3:; TAconsentID=158ba0f9-7a6f-4cd5-a70e-de83829be1fa; notice_gdpr_prefs=0,1,2,3:; notice_poptime=1720533300000; cmapi_gtm_bl=; cmapi_cookie_privacy=permit 1,2,3,4; _gcl_au=1.1.1182666783.1773970604; _fbp=fb.1.1773970608429.948452318306095890; _pin_unauth=dWlkPU9ERm1OakJsWVdVdE16a3lPUzAwT1daaUxUazFaakF0T1RGaFptVTJOemN5TVRRMQ; ADRUM=s~1773970656627&r~aHR0cHMlM0ElMkYlMkZ3d3cuaWhnLmNvbSUyRmhvdGVscyUyRnVzJTJGZW4lMkZyZXNlcnZhdGlvbg==; fs_lua=1.1773970661755; fs_uid=#15DE3H#7ea775bd-ed62-4550-bc25-6fe96e5831ff:dc4adfb5-3a63-4074-ab0f-b8c598c81a43:1773970661755::1#/1805506663; _uetsid=42434fd023fd11f1a937e3d20f4c20c3; _uetvid=4243927023fd11f1bf7edd6bc5050116; s_tslv=1773970674922; prevPageName=6C%3A%20DESTINATIONS%20%3A%20EXPLORE; s_sq=%5B%5BB%5D%5D; bm_sz=CBC3DF24B32E6E592EF01F915ADA31BB~YAAQLg7SFyIryf6cAQAAioznCB9WIrP0ZFeC5mwshpdZAW6Q3JEifeUL+bcxel+EolgCXpR51BvyiR9MxfBcoIlfHX0ymByoyaWdYjjzGFMAZp+KmdfAtyNOvreYS97aaP0THD8kCz45VVjj5QhCYY50dVzS+cuBo1d+i4kH6WKYiPSQtouq6z8+nxJ0hO2FNzvDC1IYV/sf7Oj3lnMGbjitzzef5pU2mNAFfnj4EsEC4uiMBW+oaovpK224JlTaQaS2/FZpaYgqkDgiVcg5QuiOdWdgyDcJYlxNI3luxqj4qGV/Cy3QBTK2/bpuoAOFBcefN8BCY/7hfR1vJ9BANXkOBJ7Cuxa4pG1U9SZ/szkPl10tBibQWM8jD88drk/MePNSnuWxHWuPURkRDdxes0OIe4DxKvHV2Bw=~3551796~4338499; bm_sv=94A665D42FBCB734220F2AC321E4EF58~YAAQLg7SF0kuyf6cAQAAz5XnCB80fYvDcudT8w3gmnZftyTMacdQlN4jgNLwnxqAhkd7o+jACzySiNZNgXyMnwvvivgOVEHsmfcuB9wbijDJyzpBeABlmjuW8smh/CvkRvkxj2L+PAeZ9ojmywMvP489jkpjlLCo5GeGxFE8VxDa8dfliXzgKnCa0RF489DnCaaDZr5NXhEXlm1AYDqiTj6J+uS0l4JxLxjE4IFP9/4QpL54shyk5ULADP64VA==~1; _abck=A2946CBBE0E9E973B2AAA40D075716EA~-1~YAAQLg7SF0Uuyf6cAQAAx5XnCA8ce3jeaqJybD8QKvvpd8OQc4RgK9LDmsdT6NnVg4uDJASy0GhYKIOnKRbWTN0lmdwTuSwBG49ckNfRCIq/CRMp8BjDdzCcD70fPbdxrrNeAjTJ95GLKC8LpmAQqCG8Qs1U0qGp0q01N26Q4eQZ47FVEb4vlsd9x2GudQ2+4DDl4fi5EXkxOWkqC2rR8VXaCj1V3R9JAE1EFyFz9eptL2CMr1Tkk0If9aEoWiJnQjoRO2cRSIqV3IBSZQSF7HhztsufRTXenqatgWsm+3mPuDSY1ow8E5GIZlEWjJetW/3i+MUJR6wSU3KtKVPYcXEhIzEY0Vijf1F3OsxK1E9X0IQklwvMHxXs4rqRtIOA+JKwilijB8YJ/3jSzZCTPr6f6aebHMgGDANqGY+cWJsA1oQ/cbHYWb8D5ma32on/8ZlG7nLX9ws9In6kWDPI9naGAHQ99z2QoXKiBkq2yhmEaZ2BPedq1ST1Nr4pnC23Dk6JoF9IdoPRXu9exiuUXthT21sOHZBm2cKjWduwKpDPfs18S7ccFkKIUfXsK7iOiitSoGuvgPz9iX+Vo5QJRRKIc0aEaaJxN5MSH6h06M81MpzUuju+5okiJoKH6K9OorEkh+zMLg/7GVCGK7/mldU6KEbmBcA8xvHmGsT9NtJC/erxb7Mr~-1~-1~1773974143~AAQAAAAF%2f%2f%2f%2f%2f+aeX4nqmDCvodYhHwe%2fA+%2fFfRrXpNSpMv8LCDUUmoQWkLjPW4t3aGfB07JEQlR0+pBfGDxqVdbWNyHMxj6Q7A3Oo3X1mk9227K9Z88uWDFq0msAJ7hjhl7vrW+Mgtzj2j+0JE8%3d~1773970948; mbox=session#53aacbe7206441b79762897dea216475#1773972749|PC#53aacbe7206441b79762897dea216475.35_0#1837215472`)
// console.log(second)
let a =(getCookies(`akamaiCountryCode=US; akamaiRegionCode=CA; akamaiLatitude=33.9733; akamaiLongitude=-118.2487; akamaiIsWirelessDevice=false; akamaiIsTablet=false; X-IHG-TrueClient_IP=155.117.19.36; _bman=873c80add058e6be0a60cddbd0bace90; bm_sz=FEDA1546BE9034348BEACD12D0B6E806~YAAQDQ7SF7c2qACdAQAAlDweCh8J8Lq6E2KQ7/Za695BqnJwhiehEoiU46duWHYvp4fJR3AHsiJ+MsNhxegLVoVH4Z8BTJFo9Xsjmvj6EcSckVWS8wR2dDf2OqyzyRzTqGmHM9gCS6y14sMaNR300wVa225idixWrwTd65hG40pc7Er0fq+LlAAB/YV4GqUSwATKs4Nzb97PCdQpcbx8wqe654KlcTrAIMygRekiASjN5ZF/p0t9MyLa1x73ZDpCEXod7GXsaVvp895EhBaTTFwD7EGG0rqm5lkSryHqsrk/SP8VYgIGFjqawEKZfkU1RfdnXL3+HVmuVofr+LuKSTUUudfTYnCDSOh7L1Q361vz224R/rDUfe6JujS9eIyusdvZXCkI1png8Q==~3228465~3618882; AMCV_8EAD67C25245B1870A490D4C%40AdobeOrg=179643557%7CMCIDTS%7C20533%7CMCMID%7C59074216069025150876422351116805107992%7CvVersion%7C5.5.0; ihg-is-bot=false; akaalb_vnd_prod=~op=LB_vendor_USwest_prod:p_router_USwest|~rv=49~m=p_router_USwest:0|~os=d9ad3269d82206406224df3d38366496~id=28cf147dc3b9987e75f2b5abf077e139; viewport=large; orientation=landscape; akaalb_r08_prod=~op=LB_r08_USwest_prod:p_router_USwest|~rv=21~m=p_router_USwest:0|~os=d9ad3269d82206406224df3d38366496~id=32595e1b5942e32cd5b4c58db24ff840; _abck=FC54332280A6F32A4FC2D510DBDD61F1~-1~YAAQDQ7SF/I3uACdAQAAnKJGCg/T1g9iMZHRdXVD0IDbzWl9Hq37JoFqBjPRemury8ROEByoUasi8yhzGByxUiMzCfKOCxfhsRaK0u1HZ3njolbUV1/hWXPB5SvifHC7MCAmsctsz2AxyrKV9eYdlqf7vtlTG5wPpnWIUm70I3syq00icdKzBC4EYJqyXckKBJut77G9XWp+thtv/NedjnL7wj9VClqH6rnPLe9otNPSskuCZgVLflG2QwNBMd1iS4d20fhGO/JD2T0McS8wa1QIjTCVm9OXBGfq0vHUFJlW7vqPppxdtXCQFiMhTabrqLrQyCivBenywPQNxeNmSecsu/n3tBXDA0iky28toyqyuAmXSHPdf8S5CS+ZTgNAQgnteXKvhl+/GZGwMHJLlMz7RixXQ/XJWh9uSyzoI3JSApPCk9VRSN/lhTG6FbPobiH37xNhfHoChehwbji59+P80n4rfTZGaNWIp8wRLHCsco5svazOFTgGwXuPYRXpBCh/Lq9Uw8fKqg8/pgVOtSA7qGk5DoX0JCXV9X64~-1~-1~-1~AAQAAAAF%2f%2f%2f%2f%2f6ZDiX0HOpG7BvIY4BCA%2fjArlRrCa4qEEChyBQ33GzARwqfymfUiqhM3kzjQk0N+SBO6p3mYhuAH8zMs9DzgthDaTmoWRN7bTjwe~-1; bm_sv=4EA3C96C853007330D8893C89534758E~YAAQDQ7SF+o+uACdAQAAWrNGCh97jzaOLETCGkUgYc8CWMPN7CPRJAa4n8ocs5C30ccOXbbMF/fYWsBdQ3OkcWiQTDchE4WlG054RVXyzZmV/j2FlmLx8Qz5C18e2Fuunp5eJhS53TcmHz9vApDQ5/eW0VRZKgMvMWJbGxtH10mJsC4npT0o9pb1mY3NjqDx9TddtZFlWGb1lweoVhj19ZWEJIxghbwiilx0/JzObBfazIgnW2S03UPAaeC+~1`))
console.log(a)


// var trackingJson = {
//     "akamaiCountryCode": null,
//     "akamaiRegion": null,
//     "akamaiSubRegion": null,
//     "ihgSession": "",
//     "subSection": "",
//     "pageidbrand": "6c_brand",
//     "hotelCode": "",
//     "categoryID": "6c_new/1/en",
//     "siteCountry": "us",
//     "timeOfDayAttribute": null,
//     "pcrNumber": null,
//     "membershipStatus": null,
//     "type": "content",
//     "beFreeCookieCreationDate": null,
//     "urlType": "",
//     "loginType": "anonymous",
//     "country": "1",
//     "iata": "",
//     "controllerName": "brands",
//     "propertyCode": "",
//     "envName": null,
//     "siteLanguage": "en",
//     "brand": "6c_new",
//     "language": "en",
//     "city": "",
//     "eID": null,
//     "contentPage": null,
//     "hotelCityStateCountryCode": "",
//     "hotelBrand4Digit": "",
//     "hotelBrand": "6C",
//     "viewport": "large",
//     "orientation": "landscape",
//     "edwSellSource": "WEBWB",
//     "isBot": "false",
//     "jsonSource": "AEM",
//     "siteEvent": "json_loaded",
//     "pcrTravelType": null,
//     "reservation": {
//         "propertyLat": "",
//         "propertyLong": "",
//         "siteLocale": "en_US",
//         "ambassadorMember": "false",
//         "karmaMember": "false",
//         "concurProfile": "false"
//     }
// }




// var w = global;
// if (w.performance || w.mozPerformance || w.msPerformance || w.webkitPerformance) {
//     var d = document;
//     AKSB = w.AKSB || {},
//         AKSB.q = AKSB.q || [],
//         AKSB.mark = AKSB.mark || function (e, _) {
//             AKSB.q.push(["mark", e, _ || (new Date).getTime()])
//         }
//         ,
//         AKSB.measure = AKSB.measure || function (e, _, t) {
//             AKSB.q.push(["measure", e, _, t || (new Date).getTime()])
//         }
//         ,
//         AKSB.done = AKSB.done || function (e) {
//             AKSB.q.push(["done", e])
//         }
//         ,
//         AKSB.mark("firstbyte", (new Date).getTime()),
//         AKSB.prof = {
//             custid: "820067",
//             ustr: "",
//             originlat: "0",
//             clientrtt: "6",
//             ghostip: "23.210.14.13",
//             ipv6: false,
//             pct: "10",
//             clientip: "155.117.19.36",
//             requestid: "4429d14e",
//             region: "51978",
//             protocol: "h2",
//             blver: 14,
//             akM: "dscx",
//             akN: "ae",
//             akTT: "O",
//             akTX: "1",
//             akTI: "4429d14e",
//             ai: "297423",
//             ra: "false",
//             pmgn: "",
//             pmgi: "",
//             pmp: "",
//             qc: ""
//         },
//         function (e) {
//             var _ = d.createElement("script");
//             _.async = "async",
//                 _.src = e;
//             var t = d.getElementsByTagName("script")
//                 , t = t[t.length - 1];
//             t.parentNode.insertBefore(_, t)
//         }(("https:" === d.location.protocol ? "https:" : "http:") + "//ds-aksb-a.akamaihd.net/aksb.min.js")
// }


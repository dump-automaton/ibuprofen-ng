import fetch from "node-fetch"
import {XMLParser} from 'https://cdnjs.cloudflare.com/ajax/libs/fast-xml-parser/4.0.0-beta.8/fxparser.js'
import he from 'he'

const withAttrParser = new XMLParser({
    ignoreAttributes : false,
    attributeNamePrefix : "",
    textNodeName: "textName",
});
const noAttrParser = new XMLParser({ignoreAttributes : true});

function getSoapRequestBody(action, params) {
    let res = `<v:Envelope xmlns:v="http://schemas.xmlsoap.org/soap/envelope/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:d="http://www.w3.org/2001/XMLSchema" xmlns:c="http://schemas.xmlsoap.org/soap/encoding/">
    <v:Header/>
    <v:Body>
        <${action} xmlns="http://webservice.myi.cn/wmstudyservice/wsdl/" id="o0" c:root="1">`;
    for (let key in params) {
        res += `
            <${key} i:type="d:${typeof params[key]}">${params[key]}</${key}>`
    }
    res += `
        </${action}>
    </v:Body></v:Envelope>`;
    return res;
}

class SchoolSession {
    constructor(origin = '') {
        this.restfulURL = `${origin}/restful`
        this.soapURL = `${origin}/wmexam/wmstudyservice.WSDL`
    }

    async soapRequest(action, params) {
        let response = await fetch(this.soapURL, {
            method: 'POST',
            headers: {
                'SOAPAction': 'http://webservice.myi.cn/wmstudyservice/wsdl/' + action,
                'Content-Type': 'text/xml;charset=utf-8',
                'Accept-Encoding': 'gzip',
                'Cookie': 'userguid=ffffffffffffffffffffffffffffffff'
            },
            body: getSoapRequestBody(action, params),
        })
        return he.decode(await response.text())
    }

    async upload_to_temp_storage(filename, data) {
        return (await fetch(`https://${this.host}/PutTemporaryStorage?filename=${filename}`, {
            method: 'POST',
            body: data,
        })).ok
    }

    async getUserInfo(uid) {
        let user = {
            uid: uid,
            userguid: noAttrParser.parse(await this.soapRequest('UsersGetUserGUID', {
                'lpszUserName': uid
            }))["SOAP-ENV:Envelope"]["SOAP-ENV:Body"]["AS:UsersGetUserGUIDResponse"]["AS:szUserGUID"],
        };
        Object.assign(user, JSON.parse(noAttrParser.parse(await this.soapRequest('UsersGetUserInfoByGUID', {
            'szUserGUID': user.userguid,
        }))["SOAP-ENV:Envelope"]["SOAP-ENV:Body"]["AS:UsersGetUserInfoByGUIDResponse"]["AS:szUserInfoJson"]))
        user.classes.forEach(clz => clz.__proto__ = UserClass.prototype)
        return user
    }

    async lessonsScheduleGetTableData(userid, userClassGuid, userClassRecords = []) {
        let szReturnXML = 'enablesegment=3;'
        userClassRecords.forEach(record => szReturnXML += record.guid + '=' + record.syn_timestamp + ';')
        let result = noAttrParser.parse(await this.soapRequest('LessonsScheduleGetTableData', {
            'lpszTableName': 'lessonsschedule',
            'lpszUserClassGUID': userClassGuid,
            'lpszStudentID': userid,
            'lpszLastSyncTime': '',
            'szReturnXML': szReturnXML,
        }))
        return result["SOAP-ENV:Envelope"]["SOAP-ENV:Body"]["AS:LessonsScheduleGetTableDataResponse"]["AS:szReturnXML"].LessonsScheduleRecordData.Record
    }

    async getResourceByGUID(resourceGUID) {
        return withAttrParser.parse(await this.soapRequest('GetResourceByGUID', {
            'lpszResourceGUID': resourceGUID
        }))["SOAP-ENV:Envelope"]["SOAP-ENV:Body"]["AS:GetResourceByGUIDResponse"]["AS:szXMLContent"]
    }
}
const defaultSchoolSession = new SchoolSession()

class UserClass {
    constructor(guid, name) {
        this.guid = guid
        this.name = name
    }

    async fetchNewLessonSchedulesRecords(user, schoolSession) {
        if (this.records == undefined) {
            this.records = []
        }
        let newRecords = []
        while (true) {
            newRecords = await schoolSession.lessonsScheduleGetTableData(user.uid, this.guid, this.records)
            if (!newRecords) {
                break
            }
            this.records.push(...newRecords)
        }
        return this.records
    }
}

export {UserClass, SchoolSession, defaultSchoolSession}

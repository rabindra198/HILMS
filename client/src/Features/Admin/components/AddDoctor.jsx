import React, { useState } from 'react';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import { MultiSelect } from "react-multi-select-component";
import "./doctor.css"
import { toast } from 'sonner';

const options = [
  { label: "10AM-12PM", value: "10PM-12PM" },
  { label: "12.30PM-2.30PM", value: "12.30PM-2.30PM" },
  { label: "3PM-5PM", value: "3PM-5PM" },
];


const AddDoctorForm = ({fetchdata}) => {
  const [name, setName] = useState('');
  const [expertise, setExpertise] = useState(['']);
  const [image, setImage] = useState('');

  const [selectdate, setSelectDate] = useState([]);
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [desc, setDesc] = useState('');
  const [ammount, seAmmount] = useState('');


  const date = selectdate.map(option => option.value);

  const handleExpertiseChange = (index, value) => {
    const updatedExpertise = [...expertise];
    updatedExpertise[index] = value;
    setExpertise(updatedExpertise);
  };

  const handleAddExpertise = () => {
    setExpertise([...expertise, '']);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const doctorData = { name, expertise, image, date, contact, email, password, desc, ammount };
      const response = await axios.post('http://localhost:8080/doctor', doctorData, {
        headers: {
          authorization: localStorage.getItem("jwt"),
        },
      });

      if (response) {
        setName("");
        setExpertise(['']);
        setImage("");
        setSelectDate([]);
        setContact("");
        setEmail("");
        setPassword("");
        setDesc("");
        seAmmount("");
        toast.success("Doctor Added Successfully");
        fetchdata?.();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to add doctor");
    }
  };

  return (
    <div className="add-doctor-container max-w-lg mx-auto p-4">
      <h4 className="text-center text-2xl font-semibold mb-4">Add Doctor</h4>
      <form onSubmit={handleSubmit}>
        <label className="block mb-2">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />

        <label className="block mt-3 mb-2">Email</label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label className="block mt-3 mb-2">Contact</label>
        <Input value={contact} onChange={(e) => setContact(e.target.value)} required />

        <label className="block mt-3 mb-2">Password</label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        <label className="block mt-3 mb-2">Total Amount</label>
        <Input value={ammount} onChange={(e) => seAmmount(e.target.value)} required />

        <label className="block mt-3 mb-2">Description</label>
        <textarea className="w-full rounded-lg border p-2" value={desc} onChange={(e) => setDesc(e.target.value)} required />

        <div className="mt-3">
          <label className="block mb-2">Expertise</label>
          {expertise.map((value, index) => (
            <div key={index} className="mb-2">
              <Input value={value} onChange={(e) => handleExpertiseChange(index, e.target.value)} required />
            </div>
          ))}
          <Button type="button" variant="outline" onClick={handleAddExpertise} className="mt-2">Add More</Button>
        </div>

        <label className="block mt-4 mb-2">Image URL</label>
        <Input value={image} onChange={(e) => setImage(e.target.value)} required />

        <div className="mt-3 mb-3">
          <MultiSelect
            options={options}
            value={selectdate}
            onChange={setSelectDate}
            labelledBy="Choose Date"
            className='select'
          />
        </div>

        <Button type="submit">Submit</Button>
      </form>
    </div>
  );
};

export default AddDoctorForm;




